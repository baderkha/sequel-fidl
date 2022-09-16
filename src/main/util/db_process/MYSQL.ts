import { IDocker } from '../docker/DockerRunner';
import { BaseDockerDB } from './BaseDockerDB';
import {
    DBProcStartOut,
    DBProcTpl,
    DEFAULT_GENERATED_DB_NAME,
    IDBProcess,
} from '../../util/db_process';
import { rmdirSync } from 'fs';
import { UNEXPECTED_ERROR_LOG } from '../pubsub';
import { ipcMain } from 'electron';

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

    async StartUp(version: string): Promise<DBProcTpl> {
        const id = this.generateContainerId();
        const path = this.getAppContainerPath(id);
        return this.StartUpFromExisting(path, version, id);
    }

    async StartUpFromExisting(
        dataPath: string,
        version: string,
        containerID?: string
    ): Promise<DBProcTpl> {
        containerID = containerID ? containerID : this.generateContainerId();
        const port = await this.getFreePort();
        const [_, err] = await this.docker.RunImage('mysql', {
            ImageVersion: version,
            PortInPortOut: [port, 3306],
            VolumeBinding: [dataPath, this.DbVolume],
            CustomContainerID: containerID,
            ExtraArgs: [
                '-e',
                `MYSQL_ROOT_PASSWORD=${this.rootPwddefault}`,
                '-e',
                `MYSQL_DATABASE=${DEFAULT_GENERATED_DB_NAME}`,
            ],
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

    async ShutDown(
        processID: string,
        statePathToDelete?: string
    ): Promise<boolean> {
        if (statePathToDelete) {
            await this.DeleteState(statePathToDelete);
        }
        return this.docker.KillContainer(processID);
    }

    DeleteState(statePathToDelete: string): Promise<void> {
        try {
            rmdirSync(statePathToDelete);
        } catch (err) {
            const msg = `unexpected folder delete err ${err}`;
            ipcMain.emit(UNEXPECTED_ERROR_LOG, msg);
        }

        return Promise.resolve();
    }
}
