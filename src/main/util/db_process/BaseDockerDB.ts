import { IDocker } from "../docker/DockerRunner";
import {findFreePorts} from "find-free-ports"
import {v4} from "uuid"
import path from "path";

export class BaseDockerDB {
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
}