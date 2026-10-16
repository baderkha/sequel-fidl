import type { TerminalProcess } from '../terminal/TerminalProcess';

/**
 * Extra Options for running docker
 */
export type DockerRunOptions = {
    /**
     * Port mapping host => container
     */
    PortInPortOut : [number,number],
    /**
     * Volume binding host => conntainer
     */
    VolumeBinding : [string,string]
    /**
     * Environment variables before running a docker container
     */
    EnvVarsMap? : Map<string,string>
    /**
     * Version of image
     */
    ImageVersion? : string
    /**
     * Custom Container ID
     */
    CustomContainerID : string
    /**
     * Labels to tag the container with , lets us find the containers the app owns
     */
    Labels? : Record<string,string>
    /**
     * Extra arguments for the image entrypoint (e.g. mysqld flags)
     */
    Cmd? : Array<string>
    /**
     * Human readable progress (image pulls can take minutes)
     */
    OnProgress? : (message : string) => void
}

/**
 * Output once you exec an image
 */
export type RunImageOutput = {
    /**
     * Container ID for the image you just ran
     */
    ContainerID : string
}

export type DockerImgRunTpl = [RunImageOutput,Error]

/**
 * State of a container , `missing` when there is no container with that id / name
 */
export type ContainerState = 'running' | 'stopped' | 'missing'

/**
 * Docker Command Abstraction
 * @author Ahmad Baderkhan
 */
export interface IDocker {
    /**
     * Is the docker engine reachable
     */
    Ping() : Promise<boolean>
    /**
     * Run Docker images
     * @param {String} imageName the canonical image name
     * @param {DockerRunOptions} docker extra options
     */
    RunImage(imageName : string , options ?: DockerRunOptions ) :  Promise<DockerImgRunTpl>
    /**
     * Kill a container once
     * @param {String} containerID container id you got from the run image command
     */
    KillContainer(containerID : string) : Promise<boolean>
    /**
     * Gracefully stop a container (SIGTERM , then SIGKILL after the timeout)
     * @param containerID
     * @param timeoutSeconds
     */
    StopContainer(containerID : string , timeoutSeconds ?: number) : Promise<boolean>
    /**
     * Remove a container (stopping it first when forced)
     * @param containerID
     */
    RemoveContainer(containerID : string) : Promise<boolean>
    /**
     * Current state of a container
     * @param containerID
     */
    ContainerState(containerID : string) : Promise<ContainerState>
    /**
     * Extract a (gzipped) tar archive from the host into a folder of the container
     * @param containerID
     * @param archivePath host path of the .tar / .tar.gz
     * @param destDir folder in the container , must exist
     */
    CopyArchiveInto(containerID : string , archivePath : string , destDir : string) : Promise<Error>
    /**
     * Run a command in a running container
     * @param containerID
     * @param cmd
     */
    Exec(containerID : string , cmd : Array<string>) : Promise<ExecResult>
    /**
     * Run an interactive command in a running container with a tty (docker exec -it)
     * @param containerID
     * @param cmd
     * @param options
     */
    ExecTty(containerID : string , cmd : Array<string> , options : TtyOptions) : Promise<TerminalProcess>
    /**
     * Run an interactive throwaway container with a tty (docker run --rm -it) , pulls the image when missing
     * @param image image name with tag
     * @param cmd
     * @param options
     */
    RunTty(image : string , cmd : Array<string> , options : TtyRunOptions) : Promise<TerminalProcess>
    /**
     * Tags of a repository available locally , e.g. mysql => ['mysql:8.4' , 'mysql:5.7']
     * @param repo
     */
    LocalTags(repo : string) : Promise<Array<string>>
}

export type TtyOptions = {
    /** KEY=value */
    Env? : Array<string>
    Cols : number
    Rows : number
}

export type TtyRunOptions = TtyOptions & {
    Labels? : Record<string,string>
    /** host:ip entries , e.g. host.docker.internal:host-gateway */
    ExtraHosts? : Array<string>
    OnProgress? : (message : string) => void
}

export type ExecResult = {
    exitCode : number
    stdout : string
    stderr : string
}
