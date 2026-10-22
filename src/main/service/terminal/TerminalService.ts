import { WebContents } from 'electron';
import { clampSize, TerminalProcess } from '../../util/terminal/TerminalProcess';
import { MySQLProfile } from './MySQLProfile';
import { PostgresProfile } from './PostgresProfile';
import { Launched, ShellProfile, TerminalProfile, TerminalProfileId } from './profiles';

export type TerminalCreateInput = {
    /** chosen by the window , so output that arrives before create() resolves isn't lost */
    id: string;
    profile: TerminalProfileId;
    cwd: string | null;
    conID: string | null;
    cols: number;
    rows: number;
};

/** sent to the window once the program started */
export type TerminalInfo = { id: string; title: string; detail?: string };

type Term = {
    owner: WebContents;
    proc: TerminalProcess | null;
    size: { cols: number; rows: number };
    killed: boolean;
    cleanup?: () => void;
};

const dim = (text: string) => `\x1b[2m${text}\x1b[0m\r\n`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m\r\n`;

/**
 * Terminals of the embedded panel : each runs a profile (local shell , mysql client ...)
 * and streams to the window that opened it
 */
export class TerminalService {
    private static _instance: TerminalService;
    private terms = new Map<string, Term>();
    private profiles = new Map<TerminalProfileId, TerminalProfile>();

    constructor(profiles: TerminalProfile[]) {
        profiles.forEach((p) => this.profiles.set(p.id, p));
    }

    static Default(): TerminalService {
        if (!TerminalService._instance) {
            TerminalService._instance = new TerminalService([new ShellProfile(), new MySQLProfile(), new PostgresProfile()]);
        }
        return TerminalService._instance;
    }

    /** starts in the background : status , output , info and exit arrive as events */
    Create(owner: WebContents, input: TerminalCreateInput): { error?: string } {
        const profile = this.profiles.get(input.profile);
        if (!profile) return { error: `Unknown terminal profile "${input.profile}"` };
        if (this.terms.has(input.id)) return { error: 'That terminal already exists' };
        const { id } = input;
        const term: Term = { owner, proc: null, size: clampSize(input.cols, input.rows), killed: false };
        this.terms.set(id, term);
        // the window went away : so do its terminals
        owner.once('destroyed', () => this.Kill(id));

        const send = (channel: string, payload: object) => {
            if (!owner.isDestroyed()) owner.send(channel, payload);
        };
        const exit = (exitCode: number) => {
            if (this.terms.get(id) === term) this.terms.delete(id);
            term.cleanup?.();
            send('terminal_exit', { id, exitCode });
        };

        profile
            .Launch({
                cwd: input.cwd,
                conID: input.conID,
                cols: term.size.cols,
                rows: term.size.rows,
                progress: (message) => !term.killed && send('terminal_data', { id, data: dim(message) }),
            })
            .then(([launched, err]): void => {
                if (err) {
                    send('terminal_data', { id, data: red(err.message) });
                    exit(1);
                    return;
                }
                this.attach(id, term, launched, send, exit);
            })
            .catch((err: Error) => {
                send('terminal_data', { id, data: red(err.message) });
                exit(1);
            });
        return {};
    }

    private attach(
        id: string,
        term: Term,
        launched: Launched,
        send: (channel: string, payload: object) => void,
        exit: (code: number) => void
    ) {
        const { proc } = launched;
        term.cleanup = launched.cleanup;
        if (term.killed) {
            // closed while it was starting
            proc.kill();
            launched.cleanup?.();
            return;
        }
        term.proc = proc;
        const info: TerminalInfo = { id, title: launched.title, detail: launched.detail };
        send('terminal_info', info);
        if (launched.banner) send('terminal_data', { id, data: dim(launched.banner) });
        proc.onData((data) => send('terminal_data', { id, data }));
        proc.onExit(exit);
        // the panel may have been resized while launching
        proc.resize(term.size.cols, term.size.rows);
    }

    Write(id: string, data: string) {
        this.terms.get(id)?.proc?.write(data);
    }

    Resize(id: string, cols: number, rows: number) {
        const term = this.terms.get(id);
        if (!term) return;
        term.size = clampSize(cols, rows);
        term.proc?.resize(term.size.cols, term.size.rows);
    }

    Kill(id: string) {
        const term = this.terms.get(id);
        if (!term) return;
        this.terms.delete(id);
        term.killed = true;
        term.proc?.kill();
        term.cleanup?.();
    }

    KillAll() {
        Array.from(this.terms.keys()).forEach((id) => this.Kill(id));
    }
}
