/**
 * Something interactive behind a terminal panel : a local pseudo terminal ,
 * a tty exec inside a container ...
 */
export interface TerminalProcess {
    onData(cb: (data: string) => void): void;
    /** fires once */
    onExit(cb: (exitCode: number) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
}

export type TerminalSize = { cols: number; rows: number };

/** pseudo terminals reject tiny sizes */
export const clampSize = (cols: number, rows: number): TerminalSize => ({
    cols: Math.max(2, Math.floor(cols) || 80),
    rows: Math.max(2, Math.floor(rows) || 24),
});
