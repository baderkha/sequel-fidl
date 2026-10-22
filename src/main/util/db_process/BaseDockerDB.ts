import { IDocker } from "../docker/DockerRunner";
import {findFreePorts} from "find-free-ports"
import {v4} from "uuid"
import path from "path";
import { rmSync } from 'fs';
import { DBProcStartOptions, DBProcTpl, IDBProcess } from '.';

export abstract class BaseDockerDB implements IDBProcess {
    protected readonly docker : IDocker
    protected DbVolume : string;
    protected baseAppPath : string;
    static readonly CONTAINER_ID_PREFIX = "DOCKER_DB"
    /**
     * @param docker docker api contract
     * @param DbVolume refers to where the database container has the data
     */
    constructor(docker : IDocker,DbVolume : string , baseAppPath : string) {
        this.docker = docker;
        this.DbVolume = DbVolume;
        this.baseAppPath = path.join(baseAppPath,"db_resources")
    }

    protected getFreePort() : Promise<number> {
       return findFreePorts(1).then((data)=>data.pop())
    }

    protected generateContainerId() : string {
        return `${BaseDockerDB.CONTAINER_ID_PREFIX}-${v4()}`
    }

    protected getAppContainerPath(containerID : string) : string {
        return path.join(this.baseAppPath,containerID)
    }
    IsAvailable() { return this.docker.Ping(); }
    State(id: string) { return this.docker.ContainerState(id); }
    StartUp(version: string, opts?: DBProcStartOptions): Promise<DBProcTpl> {
        const id = this.generateContainerId();
        return this.StartUpFromExisting(this.getAppContainerPath(id), version, id, undefined, opts);
    }
    abstract StartUpFromExisting(dataPath: string, version: string, id?: string, port?: string | number, opts?: DBProcStartOptions): Promise<DBProcTpl>;
    abstract ImportArchive(id: string, archive: string, files: string[], database?: string): Promise<Error>;
    async ShutDown(id: string, dataPath?: string): Promise<boolean> {
        await this.docker.StopContainer(id, 20);
        const removed = await this.docker.RemoveContainer(id);
        if (dataPath) await this.DeleteState(dataPath);
        return removed;
    }
    async DeleteState(dataPath: string): Promise<void> { rmSync(dataPath, { recursive: true, force: true }); }
}
