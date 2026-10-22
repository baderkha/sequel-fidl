import os from 'os';
import path from 'path';
import { PtyProcess } from '../../util/terminal/PtyProcess';
import { TerminalProcess } from '../../util/terminal/TerminalProcess';
import { ErrorTuple, NewErrorTuple } from '../../util/tuple';

export type TerminalProfileId = 'shell' | 'mysql' | 'postgres';

/** what the window knows when it asks for a terminal */
export type LaunchContext = {
    cwd: string | null;
    conID: string | null;
    cols: number;
    rows: number;
    /** status lines while launching takes a while (image pulls ...) */
    progress: (message: string) => void;
};

export type Launched = {
    proc: TerminalProcess;
    /** tab title */
    title: string;
    /** tooltip / header detail */
    detail?: string;
    /** printed (dimmed) before the program's own output */
    banner?: string;
    /** after the program exited or got killed */
    cleanup?: () => void;
};

/**
 * A kind of terminal the panel can open
 */
export interface TerminalProfile {
    readonly id: TerminalProfileId;
    Launch(ctx: LaunchContext): Promise<ErrorTuple<Launched>>;
}

/** the user's login shell in the project folder */
export class ShellProfile implements TerminalProfile {
    readonly id = 'shell';

    async Launch(ctx: LaunchContext): Promise<ErrorTuple<Launched>> {
        const win = process.platform === 'win32';
        const shell = process.env.SHELL || (win ? 'powershell.exe' : '/bin/zsh');
        const cwd = ctx.cwd || os.homedir();
        try {
            const proc = PtyProcess.Spawn(shell, win ? [] : ['-l'], { cwd, cols: ctx.cols, rows: ctx.rows });
            return NewErrorTuple({ proc, title: path.basename(shell).replace(/\.exe$/, ''), detail: cwd }, null);
        } catch (err) {
            return NewErrorTuple(null, new Error(`The terminal isn't available: ${(err as Error).message}`));
        }
    }
}
