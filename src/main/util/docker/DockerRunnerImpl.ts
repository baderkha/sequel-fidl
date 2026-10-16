import Docker from 'dockerode';
import { createReadStream, existsSync } from 'fs';
import { PassThrough } from 'stream';
import os from 'os';
import path from 'path';
import {
    ContainerState,
    DockerImgRunTpl,
    ExecResult,
    DockerRunOptions,
    IDocker,
    RunImageOutput,
    TtyOptions,
    TtyRunOptions,
} from './DockerRunner';
import { DockerTtyProcess } from './DockerTtyProcess';
import { clampSize } from '../terminal/TerminalProcess';

/**
 * Platform to fall back to when an image has no build for the host arch
 * (e.g. mysql:5.7 on apple silicon)
 */
const FALLBACK_PLATFORM = 'linux/amd64';

/**
 * Implementation of the docker interface talking to the docker engine API over its socket
 * @author Ahmad Baderkhan
 */
export class DockerAPI implements IDocker {
    private docker: Docker;

    constructor(docker: Docker) {
        this.docker = docker;
    }

    /**
     * Connect to the local docker engine.
     * GUI launched apps don't inherit the shell env, so look for the known socket locations
     * when DOCKER_HOST isn't set
     */
    static Default(): DockerAPI {
        if (process.env.DOCKER_HOST || process.platform === 'win32') {
            return new DockerAPI(new Docker());
        }
        const home = os.homedir();
        const candidates = [
            '/var/run/docker.sock',
            path.join(home, '.docker/run/docker.sock'), // docker desktop
            path.join(home, '.orbstack/run/docker.sock'),
            path.join(home, '.colima/default/docker.sock'),
            path.join(home, '.rd/docker.sock'), // rancher desktop
        ];
        const socketPath =
            candidates.find((candidate) => existsSync(candidate)) ||
            candidates[0];
        return new DockerAPI(new Docker({ socketPath }));
    }

    Ping(): Promise<boolean> {
        return this.docker
            .ping()
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Run image and get back the container id
     * @param imageName
     * @param options
     */
    async RunImage(
        imageName: string,
        options: DockerRunOptions
    ): Promise<DockerImgRunTpl> {
        const image = `${imageName}:${options.ImageVersion || 'latest'}`;
        const [hostPort, containerPort] = options.PortInPortOut;
        const exposedPort = `${containerPort}/tcp`;
        const env = options.EnvVarsMap
            ? Array.from(options.EnvVarsMap, ([key, val]) => `${key}=${val}`)
            : [];
        try {
            await this.ensureImage(image, options.OnProgress);
            const container = await this.docker.createContainer({
                name: options.CustomContainerID,
                Image: image,
                Env: env,
                Cmd: options.Cmd,
                Labels: options.Labels,
                ExposedPorts: { [exposedPort]: {} },
                HostConfig: {
                    Binds: [
                        `${options.VolumeBinding[0]}:${options.VolumeBinding[1]}`,
                    ],
                    PortBindings: {
                        [exposedPort]: [{ HostPort: `${hostPort}` }],
                    },
                },
            });
            await container.start();
            const out: RunImageOutput = {
                ContainerID: options.CustomContainerID,
            };
            const res: DockerImgRunTpl = [out, null];
            return res;
        } catch (e) {
            const err = e instanceof Error ? e : new Error(`${e}`);
            const res: DockerImgRunTpl = [null, err];
            return res;
        }
    }

    /**
     * Kill a running existing container
     * @param containerID
     * @returns
     */
    KillContainer(containerID: string): Promise<boolean> {
        return this.docker
            .getContainer(containerID)
            .kill()
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Gracefully stop a running container
     * @param containerID
     * @param timeoutSeconds
     */
    StopContainer(containerID: string, timeoutSeconds = 10): Promise<boolean> {
        return this.docker
            .getContainer(containerID)
            .stop({ t: timeoutSeconds })
            .then(() => true)
            .catch((err) => err?.statusCode === 304); // 304 => already stopped
    }

    /**
     * Remove a container , force kills it if it's still running
     * @param containerID
     */
    RemoveContainer(containerID: string): Promise<boolean> {
        return this.docker
            .getContainer(containerID)
            .remove({ force: true })
            .then(() => true)
            .catch((err) => err?.statusCode === 404);
    }

    async ContainerState(containerID: string): Promise<ContainerState> {
        try {
            const info = await this.docker.getContainer(containerID).inspect();
            return info.State.Running ? 'running' : 'stopped';
        } catch (err) {
            return 'missing';
        }
    }

    CopyArchiveInto(
        containerID: string,
        archivePath: string,
        destDir: string
    ): Promise<Error> {
        return this.docker
            .getContainer(containerID)
            .putArchive(createReadStream(archivePath), { path: destDir })
            .then(() => null)
            .catch((err) => err as Error);
    }

    async Exec(containerID: string, cmd: string[]): Promise<ExecResult> {
        const exec = await this.docker.getContainer(containerID).exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ hijack: true, stdin: false });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c));
        stderr.on('data', (c: Buffer) => err.push(c));
        this.docker.modem.demuxStream(stream, stdout, stderr);
        await new Promise<void>((resolve, reject) => {
            stream.on('end', () => resolve());
            stream.on('error', reject);
        });
        const info = await exec.inspect();
        return {
            exitCode: info.ExitCode ?? -1,
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: Buffer.concat(err).toString('utf8'),
        };
    }

    async ExecTty(containerID: string, cmd: string[], options: TtyOptions): Promise<DockerTtyProcess> {
        const exec = await this.docker.getContainer(containerID).exec({
            Cmd: cmd,
            Env: options.Env,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
        });
        const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
        const { cols, rows } = clampSize(options.Cols, options.Rows);
        await exec.resize({ h: rows, w: cols }).catch(() => {});
        return new DockerTtyProcess(stream, {
            resize: (size) => exec.resize(size),
            exitCode: async () => (await exec.inspect()).ExitCode ?? 0,
        });
    }

    async RunTty(image: string, cmd: string[], options: TtyRunOptions): Promise<DockerTtyProcess> {
        await this.ensureImage(image, options.OnProgress);
        const container = await this.docker.createContainer({
            Image: image,
            Entrypoint: [],
            Cmd: cmd,
            Env: options.Env,
            Labels: options.Labels,
            Tty: true,
            OpenStdin: true,
            StdinOnce: false,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            HostConfig: { AutoRemove: true, ExtraHosts: options.ExtraHosts },
        });
        const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true, hijack: true });
        // the exit status , asked for before it can exit
        const exited: Promise<number> = container
            .wait()
            .then((r: { StatusCode?: number }) => r.StatusCode ?? 0)
            .catch((): number => 0);
        await container.start();
        const { cols, rows } = clampSize(options.Cols, options.Rows);
        await container.resize({ h: rows, w: cols }).catch(() => {});
        return new DockerTtyProcess(stream, {
            resize: (size) => container.resize(size),
            exitCode: () => exited,
            kill: () => container.kill().catch(() => {}),
        });
    }

    async LocalTags(repo: string): Promise<string[]> {
        const images = await this.docker.listImages({ filters: { reference: [repo] } }).catch((): Docker.ImageInfo[] => []);
        return images.flatMap((i) => i.RepoTags || []).filter((t) => t.startsWith(`${repo}:`));
    }

    /**
     * Pull the image if it isn't available locally , `docker run` used to do this for us
     * @param image image name with tag
     * @param onProgress
     */
    private async ensureImage(
        image: string,
        onProgress?: (message: string) => void
    ): Promise<void> {
        const exists = await this.docker
            .getImage(image)
            .inspect()
            .then(() => true)
            .catch(() => false);
        if (exists) {
            return;
        }
        try {
            await this.pull(image, undefined, onProgress);
        } catch (err) {
            if (!/no matching manifest/i.test(`${err}`)) {
                throw err;
            }
            await this.pull(image, FALLBACK_PLATFORM, onProgress);
        }
    }

    private async pull(
        image: string,
        platform?: string,
        onProgress?: (message: string) => void
    ): Promise<void> {
        onProgress && onProgress(`Pulling ${image}…`);
        const stream = await this.docker.pull(image, platform ? { platform } : {});
        // layer id => [downloaded , total]
        const layers = new Map<string, [number, number]>();
        let lastReport = 0;
        await new Promise<void>((resolve, reject) => {
            this.docker.modem.followProgress(
                stream,
                (err) => (err ? reject(err) : resolve()),
                (ev: any) => {
                    if (!onProgress || !ev.id) {
                        return;
                    }
                    const detail = ev.progressDetail || {};
                    if (ev.status === 'Downloading' && detail.total) {
                        layers.set(ev.id, [detail.current || 0, detail.total]);
                    } else if (/download complete|pull complete|already exists/i.test(ev.status || '')) {
                        const [, total] = layers.get(ev.id) || [0, 0];
                        layers.set(ev.id, [total, total]);
                    }
                    const now = Date.now();
                    if (now - lastReport < 250) {
                        return;
                    }
                    lastReport = now;
                    let done = 0;
                    let total = 0;
                    layers.forEach(([d, t]) => {
                        done += d;
                        total += t;
                    });
                    if (total > 0) {
                        const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
                        onProgress(`Pulling ${image} · ${mb(done)} / ${mb(total)} MB`);
                    }
                }
            );
        });
    }
}
