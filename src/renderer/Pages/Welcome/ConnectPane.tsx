import React from 'react';
import {
    CircleAlert,
    CircleCheck,
    LoaderCircle,
    Plug,
    Plus,
    Server,
    Trash2,
} from 'lucide-react';
import { api, ConnectionInput, SavedConnection, SessionInfo } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';

type Form = {
    id?: number;
    name: string;
    host: string;
    port: string;
    username: string;
    password: string;
    /** the saved password is kept unless the field is edited */
    keepPassword: boolean;
    database: string;
};

const EMPTY: Form = {
    name: '',
    host: '127.0.0.1',
    port: '3306',
    username: 'root',
    password: '',
    keepPassword: false,
    database: '',
};

const fromSaved = (c: SavedConnection): Form => ({
    id: c.id,
    name: c.name,
    host: c.host,
    port: `${c.port}`,
    username: c.username,
    password: '',
    keepPassword: c.hasPassword,
    database: c.database,
});

const toInput = (f: Form): ConnectionInput => ({
    id: f.id,
    name: f.name.trim(),
    host: f.host.trim() || '127.0.0.1',
    port: parseInt(f.port, 10) || 3306,
    username: f.username.trim(),
    password: f.keepPassword ? undefined : f.password,
    database: f.database.trim(),
});

type Status = { kind: 'busy' | 'ok' | 'error'; message: string } | null;

const LAST_KEY = 'sequel-fidl.last-connection';

export function ConnectPane({ onConnected }: { onConnected: (s: SessionInfo) => void }) {
    const notify = useToast();
    const [saved, setSaved] = React.useState<SavedConnection[]>([]);
    const [form, setForm] = React.useState<Form>(EMPTY);
    const [status, setStatus] = React.useState<Status>(null);
    const [confirmDelete, setConfirmDelete] = React.useState<SavedConnection | null>(null);

    const load = (selectId?: number) =>
        api.listConnections().then((list) => {
            setSaved(list || []);
            const id =
                selectId ?? (parseInt(localStorage.getItem(LAST_KEY) || '', 10) || undefined);
            const pick = list.find((c) => c.id === id);
            if (pick) {
                setForm(fromSaved(pick));
            }
        });

    React.useEffect(() => {
        load();
    }, []);

    const set = (patch: Partial<Form>) => {
        setForm((f) => ({ ...f, ...patch }));
        setStatus(null);
    };

    const busy = status?.kind === 'busy';
    const valid = form.host.trim() !== '' && form.username.trim() !== '';

    const test = () => {
        setStatus({ kind: 'busy', message: 'Testing…' });
        api.testConnection(toInput(form)).then(([version, err]) =>
            setStatus(
                err
                    ? { kind: 'error', message: err.message }
                    : { kind: 'ok', message: `Connected to MySQL ${version}` }
            )
        );
    };

    const save = () =>
        api.saveConnection(toInput(form)).then(([c, err]) => {
            if (err) {
                setStatus({ kind: 'error', message: err.message });
                return;
            }
            notify(`Saved ${c.name}`, 'success');
            load(c.id);
        });

    const connect = (f: Form = form) => {
        if (!f.host.trim() || !f.username.trim() || busy) {
            return;
        }
        setStatus({ kind: 'busy', message: 'Connecting…' });
        api.connect(toInput(f)).then(([session, err]) => {
            if (err) {
                setStatus({ kind: 'error', message: err.message });
                return;
            }
            if (f.id) {
                try {
                    localStorage.setItem(LAST_KEY, `${f.id}`);
                } catch (e) {}
            }
            setStatus(null);
            onConnected(session);
        });
    };

    const field = (
        label: string,
        key: keyof Form,
        props: React.InputHTMLAttributes<HTMLInputElement> = {}
    ) => (
        <label className="field">
            <span className="field-label">{label}</span>
            <input
                className="app-input"
                value={form[key] as string}
                onChange={(ev) => set({ [key]: ev.target.value } as Partial<Form>)}
                {...props}
            />
        </label>
    );

    return (
        <div className="welcome-split">
            <aside className="welcome-list">
                <button
                    type="button"
                    className={`welcome-item ${!form.id ? 'is-active' : ''}`}
                    onClick={() => {
                        setForm(EMPTY);
                        setStatus(null);
                    }}
                >
                    <Plus size={14} className="welcome-item-icon" />
                    <span className="welcome-item-text">
                        <span className="welcome-item-title">New connection</span>
                    </span>
                </button>
                {saved.length > 0 && <div className="sidebar-label">Saved</div>}
                {saved.map((c) => (
                    <div
                        key={c.id}
                        className={`welcome-item ${form.id === c.id ? 'is-active' : ''}`}
                        onClick={() => {
                            setForm(fromSaved(c));
                            setStatus(null);
                        }}
                        onDoubleClick={() => {
                            setForm(fromSaved(c));
                            connect(fromSaved(c));
                        }}
                    >
                        <Server size={14} className="welcome-item-icon" />
                        <span className="welcome-item-text">
                            <span className="welcome-item-title">{c.name}</span>
                            <span className="welcome-item-sub">
                                {c.username}@{c.host}:{c.port}
                            </span>
                        </span>
                        <button
                            type="button"
                            className="icon-btn is-small welcome-item-action"
                            title="Delete"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                setConfirmDelete(c);
                            }}
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </aside>

            <form
                className="welcome-pane"
                onSubmit={(ev) => {
                    ev.preventDefault();
                    connect();
                }}
            >
                <div className="welcome-pane-title">
                    {form.id ? form.name : 'Connect to MySQL'}
                </div>
                <div className="form-grid">
                    <div className="span-2">
                        {field('Name', 'name', { placeholder: 'Optional — e.g. staging' })}
                    </div>
                    {field('Host', 'host', { placeholder: '127.0.0.1', autoFocus: true })}
                    {field('Port', 'port', { placeholder: '3306', inputMode: 'numeric' })}
                    {field('User', 'username', { placeholder: 'root' })}
                    <label className="field">
                        <span className="field-label">Password</span>
                        <input
                            className="app-input"
                            type="password"
                            value={form.password}
                            placeholder={form.keepPassword ? '•••••••• saved' : ''}
                            onChange={(ev) =>
                                set({ password: ev.target.value, keepPassword: false })
                            }
                        />
                    </label>
                    <div className="span-2">
                        {field('Database', 'database', { placeholder: 'Optional' })}
                    </div>
                </div>

                <div className={`connect-status ${status ? `is-${status.kind}` : ''}`}>
                    {status?.kind === 'busy' && <LoaderCircle size={14} className="spin" />}
                    {status?.kind === 'ok' && <CircleCheck size={14} />}
                    {status?.kind === 'error' && <CircleAlert size={14} />}
                    <span>{status?.message}</span>
                </div>

                <div className="welcome-actions">
                    <button type="button" className="btn" disabled={!valid || busy} onClick={test}>
                        Test
                    </button>
                    <button type="button" className="btn" disabled={!valid || busy} onClick={save}>
                        {form.id ? 'Save' : 'Save as Favorite'}
                    </button>
                    <div className="toolbar-spacer" />
                    <button type="submit" className="btn is-primary" disabled={!valid || busy}>
                        <Plug size={13} /> Connect <kbd>↵</kbd>
                    </button>
                </div>
            </form>

            <Modal
                open={!!confirmDelete}
                title={<span>Delete {confirmDelete && <code>{confirmDelete.name}</code>}?</span>}
                submitLabel="Delete"
                danger
                onClose={() => setConfirmDelete(null)}
                onSubmit={() => {
                    const c = confirmDelete;
                    setConfirmDelete(null);
                    api.deleteConnection(c.id).then(() => {
                        if (form.id === c.id) {
                            setForm(EMPTY);
                        }
                        load();
                    });
                }}
            >
                The saved connection and its stored password are removed. The database itself
                isn't touched.
            </Modal>
        </div>
    );
}
