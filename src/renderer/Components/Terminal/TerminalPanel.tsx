import React from 'react';
import { useDatabaseDialect } from 'renderer/database/DialectContext';
import { ChevronDown, Database, Plus, RotateCcw, SquareTerminal, X } from 'lucide-react';
import type { TerminalInfo, TerminalProfileId } from 'renderer/api';
import { ContextMenu, MenuEntry, useContextMenu } from 'renderer/Components/ui/ContextMenu';
import { TerminalView, TerminalViewHandle } from './TerminalView';

export type TerminalHandle = {
    /** a shell in this folder (absolute path) */
    cd: (dir: string) => void;
    focus: () => void;
    /** new tab , the default profile when none is given */
    open: (profile?: TerminalProfileId) => void;
};

export type TerminalPanelProps = {
    visible: boolean;
    /** shells start here (the project folder) , null => home */
    cwd: string | null;
    /** mysql terminals connect to what this window is connected to */
    conID: string | null;
    connectionLabel: string;
    onClose: () => void;
};

type Tab = {
    key: number;
    profile: TerminalProfileId;
    cwd: string | null;
    title: string;
    detail?: string;
    running: boolean;
};

const PROFILE_KEY = 'sequel-fidl.terminal-profile';
const PROFILES: Record<TerminalProfileId, { label: string; icon: (size: number) => React.ReactNode; title: string }> = {
    shell: { label: 'Shell', icon: (s) => <SquareTerminal size={s} />, title: 'shell' },
    postgres: { label:'PostgreSQL',icon:(s) => <Database size={s} />,title:'psql' },
    mysql: { label: 'MySQL', icon: (s) => <Database size={s} />, title: 'mysql' },
};

const readProfile = (): TerminalProfileId => {
    try {
        const saved = localStorage.getItem(PROFILE_KEY);
        return saved === 'mysql' || saved === 'postgres' ? saved : 'shell';
    } catch (e) {
        return 'shell';
    }
};

let nextKey = 1;

/**
 * Terminal panel (⌃`) : tabs of local shells and mysql clients , kept alive while hidden
 */
export const TerminalPanel = React.forwardRef<TerminalHandle, TerminalPanelProps>(function TerminalPanel(p, ref) {
    const dialect = useDatabaseDialect();
    const [tabs, setTabs] = React.useState<Tab[]>([]);
    const [activeKey, setActiveKey] = React.useState<number | null>(null);
    const [defaultProfile, setDefaultProfile] = React.useState<TerminalProfileId>(readProfile);
    const views = React.useRef(new Map<number, TerminalViewHandle>());
    const menu = useContextMenu();
    const active = tabs.find((t) => t.key === activeKey) || null;

    const patch = (key: number, change: Partial<Tab>) =>
        setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, ...change } : t)));

    const open = (profile: TerminalProfileId = defaultProfile === 'shell' ? 'shell' : dialect, cwd: string | null = p.cwd) => {
        const key = (nextKey += 1);
        setTabs((ts) => [...ts, { key, profile, cwd, title: PROFILES[profile].title, running: true }]);
        setActiveKey(key);
    };

    /** picking a profile from the menu also makes it the default for + and ⌃` */
    const openAs = (profile: TerminalProfileId) => {
        setDefaultProfile(profile);
        try {
            localStorage.setItem(PROFILE_KEY, profile);
        } catch (e) {}
        open(profile);
    };

    const close = (key: number) => {
        const i = tabs.findIndex((t) => t.key === key);
        const rest = tabs.filter((t) => t.key !== key);
        setTabs(rest);
        if (key === activeKey) setActiveKey(rest.length ? rest[Math.min(i, rest.length - 1)].key : null);
        // closing the last one hides the panel , like vscode
        if (!rest.length) p.onClose();
    };

    // shown with nothing in it : start the default terminal
    React.useEffect(() => {
        if (p.visible && !tabs.length) open();
    }, [p.visible, tabs.length]);

    React.useImperativeHandle(ref, () => ({
        cd: (dir: string) => {
            const shell = active?.profile === 'shell' && active.running ? active : tabs.find((t) => t.profile === 'shell' && t.running);
            if (!shell) {
                open('shell', dir);
                return;
            }
            setActiveKey(shell.key);
            views.current.get(shell.key)?.send(` cd '${dir.replace(/'/g, `'\\''`)}'\r`);
        },
        focus: () => activeKey != null && views.current.get(activeKey)?.focus(),
        open: (profile?: TerminalProfileId) => open(profile),
    }));

    const profileMenu = (): MenuEntry[] => [
        { label: 'Shell', icon: PROFILES.shell.icon(14), onSelect: () => openAs('shell') },
        { label: `${PROFILES[dialect].label} , ${p.connectionLabel}`, icon: PROFILES[dialect].icon(14), disabled: !p.conID, onSelect: () => openAs(dialect) },
    ];

    return (
        <div className="terminal-panel" style={p.visible ? undefined : { display: 'none' }}>
            <div className="terminal-head">
                <div className="terminal-tabs">
                    {tabs.map((t) => (
                        <div
                            key={t.key}
                            className={`terminal-tab ${t.key === activeKey ? 'is-active' : ''} ${t.running ? '' : 'is-exited'}`}
                            title={t.detail || PROFILES[t.profile].label}
                            onMouseDown={(ev) => ev.button === 0 && setActiveKey(t.key)}
                            onAuxClick={(ev) => ev.button === 1 && close(t.key)}
                        >
                            {PROFILES[t.profile].icon(13)}
                            <span className="terminal-tab-name">{t.title}</span>
                            <button
                                type="button"
                                className="terminal-tab-close"
                                title="Kill terminal"
                                onMouseDown={(ev) => ev.stopPropagation()}
                                onClick={() => close(t.key)}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="terminal-new">
                    <button
                        type="button"
                        className="icon-btn is-small"
                        title={`New ${PROFILES[defaultProfile].label} terminal (⌃⇧\`)`}
                        onClick={() => open()}
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn is-small terminal-profile-btn"
                        title="New terminal of a kind…"
                        onClick={(ev) => menu.open(ev, profileMenu())}
                    >
                        <ChevronDown size={13} />
                    </button>
                </div>
                <div className="toolbar-spacer" />
                {active?.detail && <code className="terminal-detail">{active.detail}</code>}
                <button
                    type="button"
                    className="icon-btn is-small"
                    title="Restart"
                    disabled={!active}
                    onClick={() => active && views.current.get(active.key)?.restart()}
                >
                    <RotateCcw size={13} />
                </button>
                <button type="button" className="icon-btn is-small" title="Hide (⌃`)" onClick={p.onClose}>
                    <X size={14} />
                </button>
            </div>
            {tabs.map((t) => (
                <TerminalView
                    key={t.key}
                    ref={(h) => (h ? views.current.set(t.key, h) : views.current.delete(t.key))}
                    profile={t.profile}
                    cwd={t.cwd}
                    conID={p.conID}
                    active={p.visible && t.key === activeKey}
                    onInfo={(info: TerminalInfo) => patch(t.key, { title: info.title, detail: info.detail })}
                    onRunning={(running) => patch(t.key, { running })}
                />
            ))}
            <ContextMenu {...menu} />
        </div>
    );
});
