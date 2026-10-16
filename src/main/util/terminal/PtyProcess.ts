import { clampSize, TerminalProcess, TerminalSize } from './TerminalProcess';

// native module , loaded lazily so the app still starts if it failed to build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadPty = () => require('node-pty');

export type PtySpawnOptions = TerminalSize & {
    cwd: string;
    env?: Record<string, string>;
};

/** env for programs started from the app : a real terminal , not electron's node mode */
export const terminalEnv = (extra: Record<string, string> = {}): Record<string, string> => {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    delete env.ELECTRON_RUN_AS_NODE;
    return {
        ...env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'SequelFidl',
        BASH_SILENCE_DEPRECATION_WARNING: '1',
        ...extra,
    };
};

/**
 * A local program in a pseudo terminal (node-pty)
 */
export class PtyProcess implements TerminalProcess {
    private pty: any;

    private constructor(pty: any) {
        this.pty = pty;
    }

    /** throws when node-pty isn't available or the program can't start */
    static Spawn(file: string, args: string[], opts: PtySpawnOptions): PtyProcess {
        const { cols, rows } = clampSize(opts.cols, opts.rows);
        const pty = loadPty().spawn(file, args, {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: opts.cwd,
            env: opts.env || terminalEnv(),
        });
        return new PtyProcess(pty);
    }

    onData(cb: (data: string) => void) {
        this.pty.onData(cb);
    }

    onExit(cb: (exitCode: number) => void) {
        this.pty.onExit(({ exitCode }: { exitCode: number }) => cb(exitCode));
    }

    write(data: string) {
        this.pty.write(data);
    }

    resize(cols: number, rows: number) {
        const s = clampSize(cols, rows);
        try {
            this.pty.resize(s.cols, s.rows);
        } catch (err) {
            // resizing a program that just exited
        }
    }

    kill() {
        try {
            this.pty.kill();
        } catch (err) {
            // already gone
        }
    }
}
