import { IDocker } from '../docker/DockerRunner';
import { BaseDockerDB } from './BaseDockerDB';
import {
    DBProcStartOptions,
    DBProcStartOut,
    DBProcTpl,
    DEFAULT_GENERATED_DB_NAME,
    IDBProcess,
} from '../../util/db_process';
import { mkdirSync } from 'fs';

/**
 * MYSQL Process manger via docker.
 *
 * This will give you access to start up and shut down for the docker container
 */
export class MYSQLDocker extends BaseDockerDB implements IDBProcess {
    private rootPwddefault: string;

    constructor(
        docker: IDocker,
        baseAppPath: string,
        rootPwdDefault: string = 'root'
    ) {
        super(docker, '/var/lib/mysql', baseAppPath);
        this.rootPwddefault = rootPwdDefault;
    }

    /**
     * Start mysql on a data folder , the container is disposable : any old container with
     * the same name is removed and a new one is created on a free port
     */
    async StartUpFromExisting(
        dataPath: string,
        version: string,
        containerID?: string,
        customPort? : string | number,
        opts: DBProcStartOptions = {}
    ): Promise<DBProcTpl> {
        containerID = containerID ? containerID : this.generateContainerId();
        await this.docker.RemoveContainer(containerID);
        mkdirSync(dataPath, { recursive: true });
        const port = customPort ? (typeof customPort == "string" ? parseInt(customPort,10) : customPort) : await this.getFreePort();
        const [_, err] = await this.docker.RunImage('mysql', {
            Labels: opts.labels,
            OnProgress: opts.onProgress,
            ImageVersion: version,
            PortInPortOut: [port, 3306],
            VolumeBinding: [dataPath, this.DbVolume],
            CustomContainerID: containerID,
            EnvVarsMap: new Map([
                ['MYSQL_ROOT_PASSWORD', this.rootPwddefault],
                ['MYSQL_DATABASE', DEFAULT_GENERATED_DB_NAME],
            ]),
        });

        const out: DBProcStartOut = {
            DBDatapath: dataPath,
            ProcessID: containerID,
            Port: port,
            Password: this.rootPwddefault,
            UserName: 'root',
            DefaultGeneratedDatabase: DEFAULT_GENERATED_DB_NAME,
        };
        return err
            ? Promise.resolve([null, err])
            : Promise.resolve([out, null]);
    }

    async ImportArchive(
        processID: string,
        archivePath: string,
        sqlFiles: string[],
        dropDatabase?: string
    ): Promise<Error> {
        const dir = '/tmp/sequel-fidl-import';
        const mysql = (args: string) =>
            this.docker.Exec(processID, [
                'sh',
                '-c',
                `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot ${args}`,
            ]);
        const fail = (stderr: string) =>
            new Error(stderr.replace(/^mysql: \[Warning\].*\n?/gm, '').trim() || 'import failed');
        try {
            await this.docker.Exec(processID, ['mkdir', '-p', dir]);
            const err = await this.docker.CopyArchiveInto(processID, archivePath, dir);
            if (err) {
                return err;
            }
            if (dropDatabase) {
                const res = await mysql(`-e 'DROP DATABASE IF EXISTS \`${dropDatabase}\`'`);
                if (res.exitCode !== 0) {
                    return fail(res.stderr);
                }
            }
            for (const file of sqlFiles) {
                const res = await mysql(`< '${dir}/${file}'`);
                if (res.exitCode !== 0) {
                    return fail(res.stderr);
                }
            }
            await this.docker.Exec(processID, ['rm', '-rf', dir]);
            return null;
        } catch (err) {
            return err as Error;
        }
    }

}
