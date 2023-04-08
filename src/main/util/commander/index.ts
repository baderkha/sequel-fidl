import * as shell from 'child_process';
import { stderr } from 'process';
/**
 * Safley executes commands with user input without worrying about
 * command line injection
 * @param {String} baseCommand  the base program you want the shell to use
 */
export class Commander {
    private baseCommand: string;
    private isDebug: boolean;
    constructor(baseCommand: string, isDebug = false) {
        this.baseCommand = baseCommand;
        this.isDebug = isDebug;
    }

    /**
     * execute a command
     * @param args
     * @param envVars
     * @returns
     */
    exec(args: string[] = [], envVars?: NodeJS.ProcessEnv): Promise<string> {
        return new Promise((resolve, reject) => {
            shell.execFile(
                this.baseCommand,
                args,
                { env: envVars },
                (err: any, output: string, stdErr: string) => {
                    if (this.isDebug) {
                        console.log(output);
                        console.log(stdErr);
                    }
                    console.log(
                        'COMMAND DEBUG : err =>',
                        err,
                        'OUTPUT => ',
                        output
                    );
                    if (err) {
                        reject(stdErr);
                    } else {
                        resolve(output);
                    }
                }
            );
        });
    }
}
