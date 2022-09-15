import { DBType } from '../../model/Connections';
import { DBProcTpl, IDBProcess } from '../../util/db_process';
import { pubsub, SHUTDOWN_SERVICE_EV } from '../../util/pubsub';
import { MYSQLDocker } from '../../util/db_process/MYSQL';
import { DockerCLI } from '../../util/docker/DockerRunnerImpl';
import { Commander } from '../../util/commander';
import { BASE_APP_DATA_PATH } from '../../util/application/path';

/**
 * A Database Playground manager
 * Allows you to create playground processes for any supported database type
 */
export class PlayGroundManger {
    private dbProces: Map<DBType, IDBProcess>;

    constructor(dbProcs: Map<DBType, IDBProcess>) {
        this.dbProces = dbProcs;
    }

    static Default(): PlayGroundManger {
        const command = new Commander('docker');
        const docker = new DockerCLI(command);
        const mysql = new MYSQLDocker(docker, BASE_APP_DATA_PATH);
        const dbProces: Map<DBType, IDBProcess> = new Map();
        dbProces.set('MYSQL', mysql);
        return new PlayGroundManger(dbProces);
    }
    /**
     * onProcessCreate : on process creation stup a process kill that will be executed once the container exits
     * @param type
     * @param procId
     * @returns
     */
    private onProcessCreate(type: DBType, procId: string): () => void {
        return async () => {
            const proc = this.dbProces.get(type);
            console.log('shutting down', procId);
            await proc.ShutDown(procId);
        };
    }
    private handleOut([out, err]: DBProcTpl, type: DBType): DBProcTpl {
        if (!err) {
            // setup shutdown listener
            pubsub.addListener(
                SHUTDOWN_SERVICE_EV,
                this.onProcessCreate(type, out.ProcessID)
            );
        }
        return [out, err];
    }
    /**
     * Generates a new playground from scratch
     * @param type
     * @param version
     * @returns
     */
    newPground(type: DBType, version: string): Promise<DBProcTpl> {
        const proc = this.dbProces.get(type);
        return proc.StartUp(version).then((res) => this.handleOut(res, type));
    }

    /**
     *
     * @param type
     * @param procId
     * @returns
     */
    killPground(
        type: DBType,
        procId: string,
        statePathToDel?: string
    ): Promise<boolean> {
        return this.dbProces.get(type).ShutDown(procId, statePathToDel);
    }

    deletePlaygroundState(type: DBType, statePathToDel: string) {
        return this.dbProces.get(type).DeleteState(statePathToDel);
    }

    /**
     * Generates a playground from existing path
     * @param type
     * @param version
     * @param volPath
     * @returns
     */
    pgroundFromExistingPath(
        type: DBType,
        version: string,
        volPath: string
    ): Promise<DBProcTpl> {
        const proc = this.dbProces.get(type);
        return proc
            .StartUpFromExisting(volPath, version)
            .then((res) => this.handleOut(res, type));
    }
}
