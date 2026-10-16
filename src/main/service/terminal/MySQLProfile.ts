import { accessSync, constants, unlink, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { v4 } from 'uuid';
import { DockerAPI } from '../../util/docker/DockerRunnerImpl';
import { PtyProcess, terminalEnv } from '../../util/terminal/PtyProcess';
import { TerminalProcess } from '../../util/terminal/TerminalProcess';
import { ErrorTuple, NewErrorTuple } from '../../util/tuple';
import { Launched, LaunchContext, TerminalProfile } from './profiles';
import { describeTarget, MySQLTarget, resolveMySQLTarget } from './MySQLTarget';

/** the client's prompt , \d = current database */
const PROMPT = 'mysql \\d> ';
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i;
/** gui launched apps don't get the shell's PATH , so look where clients usually live too */
const CLIENT_DIRS = [
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/mysql-client/bin',
    '/opt/homebrew/opt/mysql-client@8.4/bin',
    '/opt/homebrew/opt/mariadb/bin',
    '/usr/local/bin',
    '/usr/local/opt/mysql-client/bin',
    '/usr/local/mysql/bin',
    '/usr/bin',
];

const clientArgs = (t: MySQLTarget, host: string, port: number) => [
    '--protocol=TCP',
    `--host=${host}`,
    `--port=${port}`,
    `--user=${t.user}`,
    ...(t.database ? [`--database=${t.database}`] : []),
    '--default-character-set=utf8mb4',
    `--prompt=${PROMPT}`,
];

/** mysql / mariadb client installed on this machine */
export const findLocalClient = (preferMariaDB = false): string | null => {
    const names = preferMariaDB ? ['mariadb', 'mysql'] : ['mysql', 'mariadb'];
    const ext = process.platform === 'win32' ? '.exe' : '';
    const dirs = Array.from(new Set([...(process.env.PATH || '').split(path.delimiter), ...CLIENT_DIRS].filter(Boolean)));
    for (const name of names) {
        for (const dir of dirs) {
            const file = path.join(dir, name + ext);
            try {
                accessSync(file, constants.X_OK);
                return file;
            } catch (err) {
                // not here
            }
        }
    }
    return null;
};

/**
 * The password goes in a private option file instead of argv (visible in `ps`) ,
 * it only has to live until the client read it
 */
const passwordFile = (password: string) => {
    const file = path.join(os.tmpdir(), `sequel-fidl-${v4()}.cnf`);
    const quoted = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    writeFileSync(file, `[client]\npassword="${quoted}"\n`, { mode: 0o600 });
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        unlink(file, () => {});
    };
    setTimeout(remove, 15000);
    return { file, remove };
};

/** newest local tag , preferring the server's own major.minor */
export const pickClientImage = (tags: string[], serverVersion: string, repo: string) => {
    const mm = (serverVersion.match(/^(\d+\.\d+)/) || [])[1];
    if (mm && tags.includes(`${repo}:${mm}`)) return { image: `${repo}:${mm}`, local: true };
    const num = (t: string) => (t.split(':')[1] || '').split('.').map((n) => parseInt(n, 10));
    const sorted = tags
        .filter((t) => !Number.isNaN(num(t)[0]))
        .sort((a, b) => {
            const [x, y] = [num(a), num(b)];
            for (let i = 0; i < 3; i += 1) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
            return 0;
        });
    if (sorted[0]) return { image: sorted[0], local: true };
    return { image: repo === 'mariadb' ? 'mariadb:11.4' : 'mysql:8.4', local: false };
};

type Started = { proc: TerminalProcess; via: string; cleanup?: () => void };

/**
 * One way of running a mysql client against a target , resolves null when it doesn't apply
 */
export type ClientLauncher = {
    name: string;
    launch(t: MySQLTarget, ctx: LaunchContext): Promise<ErrorTuple<Started> | null>;
};

/** playgrounds : the client shipped in the server's own container (same version , nothing to install) */
const containerClient: ClientLauncher = {
    name: 'playground container',
    async launch(t, ctx) {
        if (!t.container) return null;
        const docker = DockerAPI.Default();
        if ((await docker.ContainerState(t.container)) !== 'running') {
            return NewErrorTuple(null, new Error("the playground container isn't running"));
        }
        const probe = await docker
            .Exec(t.container, ['sh', '-c', 'command -v mysql || command -v mariadb'])
            .catch((): null => null);
        const bin = probe?.stdout.trim().split('\n')[0];
        if (!bin) return NewErrorTuple(null, new Error('there is no client in the container'));
        const proc = await docker.ExecTty(t.container, [bin, ...clientArgs(t, '127.0.0.1', 3306)], {
            Env: [`MYSQL_PWD=${t.password}`, 'TERM=xterm-256color', 'LANG=C.UTF-8'],
            Cols: ctx.cols,
            Rows: ctx.rows,
        });
        return NewErrorTuple({ proc, via: `${path.basename(bin)} client of the playground container` }, null);
    },
};

/** a client installed on this machine (homebrew mysql-client , mysql server package ...) */
const localClient: ClientLauncher = {
    name: 'local client',
    async launch(t, ctx) {
        const bin = findLocalClient(t.isMariaDB);
        if (!bin) return null;
        const pw = passwordFile(t.password);
        try {
            const host = t.host === 'localhost' ? '127.0.0.1' : t.host;
            const proc = PtyProcess.Spawn(bin, [`--defaults-extra-file=${pw.file}`, ...clientArgs(t, host, t.port)], {
                cwd: ctx.cwd || os.homedir(),
                cols: ctx.cols,
                rows: ctx.rows,
                env: terminalEnv(),
            });
            return NewErrorTuple({ proc, via: `local ${path.basename(bin)} client (${bin})`, cleanup: pw.remove }, null);
        } catch (err) {
            pw.remove();
            throw err;
        }
    },
};

/** last resort : a throwaway client container (docker run --rm -it mysql:<version> mysql ...) */
const dockerClient: ClientLauncher = {
    name: 'docker client',
    async launch(t, ctx) {
        const docker = DockerAPI.Default();
        if (!(await docker.Ping())) return NewErrorTuple(null, new Error("Docker isn't running"));
        const repo = t.isMariaDB ? 'mariadb' : 'mysql';
        const { image, local } = pickClientImage(await docker.LocalTags(repo), t.serverVersion, repo);
        if (!local) ctx.progress(`Downloading the ${image} image for its client (first time only)…`);
        // the host's loopback is host.docker.internal from inside a container
        const host = LOOPBACK.test(t.host) ? 'host.docker.internal' : t.host;
        const proc = await docker.RunTty(image, [repo, ...clientArgs(t, host, t.port)], {
            Env: [`MYSQL_PWD=${t.password}`, 'TERM=xterm-256color', 'LANG=C.UTF-8'],
            Cols: ctx.cols,
            Rows: ctx.rows,
            Labels: { 'com.sequel-fidl.terminal': '1' },
            ExtraHosts: ['host.docker.internal:host-gateway'],
            OnProgress: ctx.progress,
        });
        return NewErrorTuple({ proc, via: `${repo} client in a ${image} container` }, null);
    },
};

/** tried in order , the first that applies and starts wins */
export const MYSQL_CLIENT_LAUNCHERS: ClientLauncher[] = [containerClient, localClient, dockerClient];

/**
 * A mysql client already connected to the window's server and database ,
 * however it can be run on this machine
 */
export class MySQLProfile implements TerminalProfile {
    readonly id = 'mysql';

    async Launch(ctx: LaunchContext): Promise<ErrorTuple<Launched>> {
        const [t, err] = await resolveMySQLTarget(ctx.conID);
        if (err) return NewErrorTuple(null, err);
        const failures: string[] = [];
        for (const launcher of MYSQL_CLIENT_LAUNCHERS) {
            let res: ErrorTuple<Started> | null;
            try {
                res = await launcher.launch(t, ctx);
            } catch (e) {
                res = NewErrorTuple(null, e as Error);
            }
            if (!res) continue;
            const [started, failure] = res;
            if (failure) {
                failures.push(`${launcher.name}: ${failure.message}`);
                continue;
            }
            return NewErrorTuple(
                {
                    proc: started.proc,
                    title: t.database || 'mysql',
                    detail: `${describeTarget(t)} · ${started.via}`,
                    banner:
                        `MySQL ${t.serverVersion} · ${describeTarget(t)} · ${started.via}\r\n` +
                        "A separate session: a transaction begun in the app isn't visible here.",
                    cleanup: started.cleanup,
                },
                null
            );
        }
        return NewErrorTuple(
            null,
            new Error(
                [
                    "Couldn't start a MySQL client.",
                    ...failures.map((f) => `  · ${f}`),
                    'Install one (brew install mysql-client) or start Docker, then press Enter to retry.',
                ].join('\r\n')
            )
        );
    }
}
