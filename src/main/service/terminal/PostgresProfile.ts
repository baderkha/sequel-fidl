import { accessSync, constants, writeFileSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { v4 } from 'uuid';
import { DockerAPI } from '../../util/docker/DockerRunnerImpl';
import { PtyProcess, terminalEnv } from '../../util/terminal/PtyProcess';
import { NewErrorTuple } from '../../util/tuple';
import { TerminalProfile, LaunchContext, Launched } from './profiles';
import { ErrorTuple } from '../../util/tuple';
import { describeTarget, resolveDatabaseTarget } from './MySQLTarget';

export class PostgresProfile implements TerminalProfile {
    readonly id = 'postgres';
    async Launch(ctx: LaunchContext): Promise<ErrorTuple<Launched>> {
        const [target, error] = await resolveDatabaseTarget(ctx.conID);
        if (error) return NewErrorTuple(null, error);
        if (target.type !== 'postgres')
            return NewErrorTuple(
                null,
                new Error('This connection is not PostgreSQL.')
            );
        const database = target.database || 'postgres';
        const args = (host: string, port: number) => [
            '-X',
            '-h',
            host,
            '-p',
            String(port),
            '-U',
            target.user,
            '-d',
            database,
        ];
        const env = [
            `PGPASSWORD=${target.password}`,
            'TERM=xterm-256color',
            'LANG=C.UTF-8',
        ];
        const docker = DockerAPI.Default();
        let proc;
        let cleanup: (() => void) | undefined;
        if (target.container) {
            proc = await docker.ExecTty(
                target.container,
                ['psql', ...args('127.0.0.1', 5432)],
                { Env: env, Cols: ctx.cols, Rows: ctx.rows }
            );
        } else {
            const dirs = [
                ...(process.env.PATH || '').split(path.delimiter),
                '/opt/homebrew/opt/libpq/bin',
                '/usr/local/opt/libpq/bin',
                '/opt/homebrew/bin',
                '/usr/local/bin',
                '/usr/bin',
            ];
            const binary = dirs
                .map((dir) =>
                    path.join(
                        dir,
                        process.platform === 'win32' ? 'psql.exe' : 'psql'
                    )
                )
                .find((file) => {
                    try {
                        accessSync(file, constants.X_OK);
                        return true;
                    } catch (e) {
                        return false;
                    }
                });
            if (binary) {
                const file = path.join(
                    os.tmpdir(),
                    `sequel-fidl-${v4()}.pgpass`
                );
                const escape = (value: string) =>
                    value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
                writeFileSync(
                    file,
                    [
                        target.host,
                        String(target.port),
                        database,
                        target.user,
                        target.password,
                    ]
                        .map(escape)
                        .join(':') + '\n',
                    { mode: 0o600 }
                );
                cleanup = () => {
                    try {
                        unlinkSync(file);
                    } catch (e) {}
                };
                try {
                    proc = PtyProcess.Spawn(
                        binary,
                        args(target.host, target.port),
                        {
                            cwd: ctx.cwd || os.homedir(),
                            cols: ctx.cols,
                            rows: ctx.rows,
                            env: { ...terminalEnv(), PGPASSFILE: file },
                        }
                    );
                } catch (e) {
                    cleanup();
                    return NewErrorTuple(null, e as Error);
                }
            } else if (await docker.Ping()) {
                ctx.progress('Starting a PostgreSQL client container…');
                const host = /^(localhost|127\.\d+\.\d+\.\d+|::1)$/.test(
                    target.host
                )
                    ? 'host.docker.internal'
                    : target.host;
                const major =
                    target.serverVersion.match(
                        /(?:PostgreSQL\s+)?(\d+)/
                    )?.[1] || '17';
                proc = await docker.RunTty(
                    `postgres:${major}`,
                    ['psql', ...args(host, target.port)],
                    {
                        Env: env,
                        Cols: ctx.cols,
                        Rows: ctx.rows,
                        ExtraHosts: ['host.docker.internal:host-gateway'],
                        Labels: { 'com.sequel-fidl.terminal': '1' },
                        OnProgress: ctx.progress,
                    }
                );
            } else
                return NewErrorTuple(
                    null,
                    new Error(
                        'Install psql (brew install libpq) or start Docker to open a PostgreSQL terminal.'
                    )
                );
        }
        return NewErrorTuple(
            {
                proc,
                cleanup,
                title: database,
                detail: describeTarget(target),
                banner: `PostgreSQL · ${describeTarget(
                    target
                )}\r\nA separate session from the app's transaction.`,
            },
            null
        );
    }
}
