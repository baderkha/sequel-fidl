import { Commander } from '../commander';
import {
    DockerImgRunTpl,
    DockerRunOptions,
    IDocker,
    RunImageOutput,
} from './DockerRunner';

/**
 * Implementation of the docker interface using
 * @author Ahmad Baderkhan
 */
export class DockerCLI implements IDocker {
    private docker: Commander;

    constructor(dockerCommand: Commander) {
        this.docker = dockerCommand;
    }

    /**
     * Run image and get back the container id
     * @param imageName
     * @param options
     */
    RunImage(
        imageName: string,
        options: DockerRunOptions
    ): Promise<DockerImgRunTpl> {
        let extraArgs = options.ExtraArgs ? options.ExtraArgs : [];
        return this.docker
            .exec([
                'run',
                '--name',
                options.CustomContainerID,
                '-v',
                `${options.VolumeBinding[0]}:${options.VolumeBinding[1]}`,
                '-p',
                `${options.PortInPortOut[0]}:${options.PortInPortOut[1]}`,
                '-d',
                ...extraArgs,
                imageName,
            ])
            .then(() => {
                let out: RunImageOutput = {
                    ContainerID: options.CustomContainerID,
                };
                let err: Error;
                const res: DockerImgRunTpl = [out, err];
                return res;
            })
            .catch((stdErr) => {
                let out: RunImageOutput = null;
                let err: Error = new Error(stdErr);
                const res: DockerImgRunTpl = [out, err];
                return res;
            });
    }

    /**
     * Kill a running existing container
     * @param containerID
     * @returns
     */
    KillContainer(containerID: string): Promise<boolean> {
        return this.docker
            .exec(['kill', containerID])
            .then(() => true)
            .catch(() => false);
    }
}
