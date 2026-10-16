import { Duplex } from 'stream';
import { StringDecoder } from 'string_decoder';
import { clampSize, TerminalProcess } from '../terminal/TerminalProcess';

export type DockerTtyHooks = {
    /** resize the tty (exec or container) */
    resize: (size: { h: number; w: number }) => Promise<unknown>;
    /** exit code once the stream ended */
    exitCode: () => Promise<number>;
    /** extra teardown on kill (e.g. stop the container) */
    kill?: () => Promise<unknown>;
};

/**
 * A docker exec / container attached with a tty , the hijacked stream is the terminal
 * (no stdout / stderr multiplexing when Tty is on)
 */
export class DockerTtyProcess implements TerminalProcess {
    private stream: Duplex;
    private hooks: DockerTtyHooks;
    private decoder = new StringDecoder('utf8');
    private exitCbs: Array<(code: number) => void> = [];
    private exited = false;

    constructor(stream: Duplex, hooks: DockerTtyHooks) {
        this.stream = stream;
        this.hooks = hooks;
        const finish = () => {
            if (this.exited) return;
            this.exited = true;
            this.hooks
                .exitCode()
                .catch(() => 0)
                .then((code) => this.exitCbs.forEach((cb) => cb(code)));
        };
        stream.on('end', finish);
        stream.on('close', finish);
        stream.on('error', finish);
    }

    onData(cb: (data: string) => void) {
        this.stream.on('data', (chunk: Buffer) => {
            const text = this.decoder.write(chunk);
            if (text) cb(text);
        });
    }

    onExit(cb: (exitCode: number) => void) {
        this.exitCbs.push(cb);
    }

    write(data: string) {
        if (!this.exited) this.stream.write(data);
    }

    resize(cols: number, rows: number) {
        const s = clampSize(cols, rows);
        this.hooks.resize({ h: s.rows, w: s.cols }).catch(() => {});
    }

    kill() {
        // closing stdin ends interactive clients , the hook handles the rest
        try {
            this.stream.end();
        } catch (err) {
            // already closed
        }
        this.hooks.kill?.().catch(() => {});
        setTimeout(() => this.stream.destroy(), 500);
    }
}
