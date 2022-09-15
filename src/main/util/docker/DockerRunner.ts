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
     * Extra arguments for docker . becareful
     */
    ExtraArgs? : Array<string>
    /**
     * Version of image
     */
    ImageVersion? : string
    /**
     * Custom Container ID
     */
    CustomContainerID : string
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
 * Docker Command Abstraction
 * @author Ahmad Baderkhan
 */
export interface IDocker {
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
}