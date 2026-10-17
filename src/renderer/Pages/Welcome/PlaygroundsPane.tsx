import React from 'react';
import {
    Box,
    CircleAlert,
    Copy,
    LoaderCircle,
    Pencil,
    Play,
    Plus,
    Square,
    Trash2,
} from 'lucide-react';
import { api, onMainEvent, PlaygroundInfo, SessionInfo } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';
import dockerNames from 'docker-names'

const VERSIONS = [
    { tag: '8.4', label: 'MySQL 8.4 (LTS)' },
    { tag: '8.0', label: 'MySQL 8.0' },
    { tag: '5.7', label: 'MySQL 5.7 (x86 only , emulated on Apple Silicon)' },
    { tag: 'latest', label: 'Latest innovation release' },
];

const POLL_MS = 4000;

const ago = (iso: string) => {
    if (!iso) {
        return 'never';
    }
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
};

const StateDot = ({ pg }: { pg: PlaygroundInfo }) =>
    pg.busy ? (
        <LoaderCircle size={12} className="spin pg-dot-busy" />
    ) : (
        <span className={`pg-dot is-${pg.state}`} />
    );

const stateLabel = (pg: PlaygroundInfo) =>
    pg.busy ? pg.busy : pg.state === 'running' ? `Running on port ${pg.port}` : 'Stopped';

export function PlaygroundsPane({ onConnected }: { onConnected: (s: SessionInfo) => void }) {
    const notify = useToast();
    const [list, setList] = React.useState<PlaygroundInfo[]>([]);
    const [loaded, setLoaded] = React.useState(false);
    const [docker, setDocker] = React.useState<boolean | null>(null);
    const [selected, setSelected] = React.useState<number | 'new'>('new');
   
    const [customPort,setCustomPort] = React.useState(null);
    const [version, setVersion] = React.useState('8.4');
    const [custom, setCustom] = React.useState('');
    const [sample, setSample] = React.useState('');
    const [samples, setSamples] = React.useState<
        { id: string; name: string; description: string; database: string }[]
    >([]);
    const [error, setError] = React.useState('');
    const [opening, setOpening] = React.useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = React.useState<PlaygroundInfo | null>(null);
    const [renaming, setRenaming] = React.useState<PlaygroundInfo | null>(null);
    const [renameTo, setRenameTo] = React.useState('');
    
     const [name, setName] = React.useState(`${dockerNames.getRandomName().replaceAll("_","-")}-${version}`);
    const refresh = React.useCallback(() => {
        api.dockerAvailable().then(setDocker);
        return api.listPlaygrounds().then((l) => {
            setList(l || []);
            setLoaded(true);
            return l || [];
        });
    }, []);

    React.useEffect(() => {
        api.listSamples().then((s) => setSamples(s || []));
    }, []);

    React.useEffect(() => {
        refresh().then((l) => l.length && setSelected((s) => (s === 'new' ? l[0].id : s)));
        const timer = window.setInterval(refresh, POLL_MS);
        // a workspace window opened / closed somewhere
        const offSessions = onMainEvent('sessions_changed', () => refresh());
        // live progress (image pull , boot) while an operation runs
        const off = onMainEvent<{ id: number; message: string }>(
            'playground_progress',
            ({ id, message }) =>
                setList((all) => all.map((pg) => (pg.id === id ? { ...pg, busy: message } : pg)))
        );
        return () => {
            window.clearInterval(timer);
            off && off();
            offSessions && offSessions();
        };
    }, [refresh]);

    const current = typeof selected === 'number' ? list.find((pg) => pg.id === selected) : null;

    const open = (id: number) => {
        setError('');
        setOpening(id);
        api.openPlayground(id).then(([session, err]) => {
            setOpening(null);
            if (err) {
                setError(err.message);
                refresh();
                return;
            }
            onConnected(session);
            refresh();
        });
    };

    const create = (andOpen: boolean) => {
        const tag = version === 'custom' ? custom.trim() : version;
        if (!tag) {
            return;
        }
        setError('');
        api.createPlayground({ name: name.trim(), version: tag, sample,port : customPort }).then(([pg, err]) => {
            if (err) {
                setError(err.message);
                return;
            }
            setName('');
            setSelected(pg.id);
            refresh();
            andOpen && open(pg.id);
        });
    };

    const stop = (pg: PlaygroundInfo) =>
        api.stopPlayground(pg.id).then((err) => {
            err ? notify(err.message, 'error') : notify(`Stopped ${pg.name}`, 'success');
            refresh();
        });

    const remove = (pg: PlaygroundInfo) =>
        api.deletePlayground(pg.id).then((err) => {
            if (err) {
                notify(err.message, 'error');
            } else {
                notify(`Deleted ${pg.name}`, 'success');
                setSelected('new');
            }
            refresh();
        });

    const busy = !!current && (!!current.busy || opening === current.id);

    return (
        <div className="welcome-split">
            <aside className="welcome-list">
                <button
                    type="button"
                    className={`welcome-item ${selected === 'new' ? 'is-active' : ''}`}
                    onClick={() => {
                        setSelected('new');
                        setError('');
                    }}
                >
                    <Plus size={14} className="welcome-item-icon" />
                    <span className="welcome-item-text">
                        <span className="welcome-item-title">New playground</span>
                    </span>
                </button>
                {list.length > 0 && <div className="sidebar-label">Playgrounds</div>}
                {list.map((pg) => (
                    <div
                        key={pg.id}
                        className={`welcome-item ${selected === pg.id ? 'is-active' : ''}`}
                        onClick={() => {
                            setSelected(pg.id);
                            setError('');
                        }}
                        onDoubleClick={() => open(pg.id)}
                    >
                        <Box size={14} className="welcome-item-icon" />
                        <span className="welcome-item-text">
                            <span className="welcome-item-title">{pg.name}</span>
                            <span className="welcome-item-sub">
                                MySQL {pg.version} · {pg.state === 'running' ? 'running' : 'stopped'}
                            </span>
                        </span>
                        <StateDot pg={pg} />
                    </div>
                ))}
            </aside>

            <div className="welcome-pane">
                {docker === false && (
                    <div className="banner is-warning">
                        <CircleAlert size={15} />
                        <span>
                            Docker isn't reachable. Playgrounds run MySQL in Docker , start Docker
                            Desktop (or OrbStack / Colima).
                        </span>
                        <button type="button" className="btn is-ghost" onClick={refresh}>
                            Retry
                        </button>
                    </div>
                )}

                {current ? (
                    <>
                        <div className="welcome-pane-title">
                            {current.name}
                            <button
                                type="button"
                                className="icon-btn is-small"
                                title="Rename"
                                onClick={() => {
                                    setRenaming(current);
                                    setRenameTo(current.name);
                                }}
                            >
                                <Pencil size={13} />
                            </button>
                        </div>
                        <div className={`pg-state is-${current.state}`}>
                            <StateDot pg={current} />
                            {opening === current.id && !current.busy ? 'Connecting…' : stateLabel(current)}
                        </div>
                        <dl className="pg-facts">
                            <dt>Windows</dt>
                            <dd>{current.connected ? 'Open' : 'None'}</dd>
                            <dt>Version</dt>
                            <dd>MySQL {current.version}</dd>
                            <dd>Port</dd>
                            <dd>{current.port}</dd>
                            <dt>Login</dt>
                            <dd className="mono">root / root · {current.database}</dd>
                            {current.sample && (
                                <>
                                    <dt>Sample</dt>
                                    <dd>
                                        {samples.find((s) => s.id === current.sample)?.name || current.sample}
                                        {current.seeded ? ' · imported' : ' · imported on first start'}
                                    </dd>
                                </>
                            )}
                            <dt>Data</dt>
                            <dd className="mono pg-path">
                                <span>{current.dataPath}</span>
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Copy path"
                                    onClick={() =>
                                        navigator.clipboard
                                            .writeText(current.dataPath)
                                            .then(() => notify('Copied path', 'success'))
                                    }
                                >
                                    <Copy size={12} />
                                </button>
                            </dd>
                            <dt>Created</dt>
                            <dd>{ago(current.createdAt)}</dd>
                            <dt>Last used</dt>
                            <dd>{ago(current.lastUsedAt)}</dd>
                        </dl>
                        <p className="ct-hint">
                            The data folder is the playground. Opening it starts a fresh container and
                            a new window , it's stopped once its last window closes (or the app quits).
                            Your data is kept until you delete the playground.
                        </p>
                        {error && (
                            <div className="error-box">
                                <CircleAlert size={15} />
                                {error}
                            </div>
                        )}
                        <div className="welcome-actions">
                            <button
                                type="button"
                                className="btn is-ghost ct-delete"
                                disabled={busy}
                                onClick={() => setConfirmDelete(current)}
                            >
                                <Trash2 size={13} /> Delete…
                            </button>
                            <div className="toolbar-spacer" />
                            {current.state === 'running' && (
                                <button
                                    type="button"
                                    className="btn"
                                    disabled={busy}
                                    onClick={() => stop(current)}
                                >
                                    <Square size={11} fill="currentColor" /> Stop
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn is-primary"
                                disabled={busy || docker === false}
                                onClick={() => open(current.id)}
                            >
                                <Play size={12} fill="currentColor" />
                                {current.state === 'running' ? 'Open Window' : 'Start & Open'}
                            </button>
                        </div>
                    </>
                ) : (
                    <form
                        className="welcome-form"
                        onSubmit={(ev) => {
                            ev.preventDefault();
                            create(true);
                        }}
                    >
                        <div className="welcome-pane-title">New playground</div>
                        <p className="ct-hint">
                            A throwaway MySQL server running in Docker. Its data lives in the app's
                            own folder and survives restarts.
                        </p>
                        <div className="form-grid">
                            <label className="field span-2">
                                <span className="field-label">Name</span>
                                <input
                                    className="app-input"
                                    autoFocus
                                    value={name}
                                    placeholder={`MySQL ${version === 'custom' ? custom || '…' : version}`}
                                    onChange={(ev) => setName(ev.target.value)}
                                />
                            </label>

                            <label className="field span-2">
                                <span className="field-label">Reserved Port</span>
                                <input
                                    className="app-input"
                                    autoFocus
                                    value={customPort}
                                    placeholder={`automatically generated`}
                                    onChange={(ev) => setCustomPort(ev.target.value)}
                                />
                            </label>
                            
                            <label className="field">
                                <span className="field-label">Version</span>
                                <select
                                    className="select"
                                    value={version}
                                    onChange={(ev) => setVersion(ev.target.value)}
                                >
                                    {VERSIONS.map((v) => (
                                        <option key={v.tag} value={v.tag}>
                                            {v.label}
                                        </option>
                                    ))}
                                    <option value="custom">Other tag…</option>
                                </select>
                            </label>
                            {version === 'custom' && (
                                <label className="field">
                                    <span className="field-label">Image tag</span>
                                    <input
                                        className="app-input is-mono"
                                        value={custom}
                                        placeholder="e.g. 8.0.36"
                                        onChange={(ev) => setCustom(ev.target.value)}
                                    />
                                </label>
                            )}
                        </div>
                        <div className="field">
                            <span className="field-label">Start with</span>
                            <div className="sample-options">
                                {[{ id: '', name: 'Empty database', description: 'Just main_db , build your own tables.', database: '' }, ...samples].map((s) => (
                                    <label key={s.id || 'none'} className={`sample-option ${sample === s.id ? 'is-active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="sample"
                                            checked={sample === s.id}
                                            onChange={() => setSample(s.id)}
                                        />
                                        <div>
                                            <strong>
                                                {s.name}
                                                {s.database && <code className="mono"> · {s.database}</code>}
                                            </strong>
                                            <span>{s.description}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {error && (
                            <div className="error-box">
                                <CircleAlert size={15} />
                                {error}
                            </div>
                        )}
                        <div className="welcome-actions">
                            <div className="toolbar-spacer" />
                            <button
                                type="button"
                                className="btn"
                                disabled={version === 'custom' && !custom.trim()}
                                onClick={() => create(false)}
                            >
                                Create
                            </button>
                            <button
                                type="submit"
                                className="btn is-primary"
                                disabled={docker === false || (version === 'custom' && !custom.trim())}
                            >
                                <Play size={12} fill="currentColor" /> Create & Open
                            </button>
                        </div>
                        {!loaded && <div className="ct-hint">Loading playgrounds…</div>}
                    </form>
                )}
            </div>

            <Modal
                open={!!confirmDelete}
                icon={<Trash2 size={16} />}
                title={<span>Delete {confirmDelete && <code>{confirmDelete.name}</code>}?</span>}
                submitLabel="Delete Playground"
                danger
                onClose={() => setConfirmDelete(null)}
                onSubmit={() => {
                    const pg = confirmDelete;
                    setConfirmDelete(null);
                    remove(pg);
                }}
            >
                The container is stopped and the data folder with every database in it is
                deleted. This can't be undone.
            </Modal>
            <Modal
                open={!!renaming}
                icon={<Pencil size={16} />}
                title="Rename playground"
                submitLabel="Rename"
                submitDisabled={!renameTo.trim()}
                onClose={() => setRenaming(null)}
                onSubmit={() => {
                    const pg = renaming;
                    setRenaming(null);
                    api.renamePlayground(pg.id, renameTo.trim()).then(refresh);
                }}
            >
                <input
                    className="app-input"
                    autoFocus
                    value={renameTo}
                    onChange={(ev) => setRenameTo(ev.target.value)}
                    onFocus={(ev) => ev.target.select()}
                />
            </Modal>
        </div>
    );
}
