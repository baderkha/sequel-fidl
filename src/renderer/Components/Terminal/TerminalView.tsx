import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api, onMainEvent, TerminalInfo, TerminalProfileId } from 'renderer/api';
import { useTheme } from 'renderer/theme/ThemeProvider';
import type { AppTheme } from 'renderer/theme/themes';

export type TerminalViewHandle = {
    /** type into the program */
    send: (data: string) => void;
    focus: () => void;
    /** kill the program and start a new one */
    restart: () => void;
};

export type TerminalViewProps = {
    profile: TerminalProfileId;
    cwd: string | null;
    conID: string | null;
    active: boolean;
    onInfo: (info: TerminalInfo) => void;
    onRunning: (running: boolean) => void;
};

const xtermTheme = (t: AppTheme) => ({
    background: t.colors.surfaceSunken,
    foreground: t.colors.text,
    cursor: t.colors.accent,
    cursorAccent: t.colors.surfaceSunken,
    selectionBackground: t.kind === 'dark' ? 'rgba(34, 141, 242, 0.35)' : 'rgba(10, 108, 255, 0.25)',
    black: t.kind === 'dark' ? '#3a3a3a' : '#000000',
    brightBlack: t.colors.textFaint,
    red: t.colors.danger,
    green: t.colors.success,
    yellow: t.colors.warning,
    blue: t.colors.accent,
    magenta: t.syntax.string,
    cyan: t.syntax.keyword,
    white: t.colors.textMuted,
    brightWhite: t.colors.text,
});

let seq = 0;
const newSessionId = () => `${Date.now().toString(36)}-${(seq += 1)}`;

/**
 * One terminal tab : an xterm bound to a program in the main process.
 * Restarting starts a new session id , so late events of the old one are ignored
 */
export const TerminalView = React.forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(p, ref) {
    const hostRef = React.useRef<HTMLDivElement>(null);
    const termRef = React.useRef<Terminal>(null);
    const fitRef = React.useRef<FitAddon>(null);
    /** current session , null once it exited */
    const sessionRef = React.useRef<string | null>(null);
    const props = React.useRef(p);
    props.current = p;
    const { theme } = useTheme();

    const start = React.useCallback(() => {
        const term = termRef.current;
        if (!term) return;
        const id = newSessionId();
        sessionRef.current = id;
        props.current.onRunning(true);
        const { profile, cwd, conID } = props.current;
        api.terminalCreate({ id, profile, cwd, conID, cols: term.cols, rows: term.rows }).then((res) => {
            if (res?.error && sessionRef.current === id) {
                sessionRef.current = null;
                props.current.onRunning(false);
                term.write(`\x1b[31m${res.error}\x1b[0m\r\n`);
            }
        });
    }, []);

    React.useEffect(() => {
        const term = new Terminal({
            fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Monaco, monospace",
            fontSize: 12.5,
            lineHeight: 1.2,
            cursorBlink: true,
            macOptionIsMeta: true,
            scrollback: 5000,
            theme: xtermTheme(theme),
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(hostRef.current);
        termRef.current = term;
        fitRef.current = fit;
        const refit = () => {
            // hidden tabs have no size
            if (!hostRef.current?.offsetWidth) return;
            try {
                fit.fit();
            } catch (e) {}
        };
        refit();

        const input = term.onData((data) => {
            if (sessionRef.current) {
                api.terminalWrite(sessionRef.current, data);
            } else if (data === '\r') {
                // exited : Enter starts it again
                term.write('\r\n');
                start();
            }
        });
        const resize = term.onResize(({ cols, rows }) => sessionRef.current && api.terminalResize(sessionRef.current, cols, rows));
        const offData = onMainEvent<{ id: string; data: string }>('terminal_data', ({ id, data }) => {
            if (id === sessionRef.current) term.write(data);
        });
        const offInfo = onMainEvent<TerminalInfo>('terminal_info', (info) => {
            if (info.id === sessionRef.current) props.current.onInfo(info);
        });
        const offExit = onMainEvent<{ id: string; exitCode: number }>('terminal_exit', ({ id, exitCode }) => {
            if (id !== sessionRef.current) return;
            sessionRef.current = null;
            props.current.onRunning(false);
            term.write(`\r\n\x1b[2m[exited with code ${exitCode} , press Enter to start again]\x1b[0m\r\n`);
        });
        const observer = new ResizeObserver(refit);
        observer.observe(hostRef.current);
        start();
        return () => {
            observer.disconnect();
            input.dispose();
            resize.dispose();
            offData && offData();
            offInfo && offInfo();
            offExit && offExit();
            if (sessionRef.current) api.terminalKill(sessionRef.current);
            sessionRef.current = null;
            term.dispose();
        };
    }, []);

    React.useEffect(() => {
        if (termRef.current) termRef.current.options.theme = xtermTheme(theme);
    }, [theme]);

    // coming back to a tab : fit (it may have been resized while hidden) and focus
    React.useEffect(() => {
        if (!p.active) return;
        const t = window.setTimeout(() => {
            try {
                fitRef.current?.fit();
            } catch (e) {}
            termRef.current?.focus();
        }, 0);
        return () => window.clearTimeout(t);
    }, [p.active]);

    React.useImperativeHandle(ref, () => ({
        send: (data: string) => sessionRef.current && api.terminalWrite(sessionRef.current, data),
        focus: () => termRef.current?.focus(),
        restart: () => {
            if (sessionRef.current) api.terminalKill(sessionRef.current);
            sessionRef.current = null;
            termRef.current?.reset();
            start();
        },
    }));

    return <div className="terminal-host" ref={hostRef} style={p.active ? undefined : { display: 'none' }} />;
});
