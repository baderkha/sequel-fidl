import React from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Save } from 'lucide-react';
import { Modal } from 'renderer/Components/ui/Modal';
import type { Worksheets } from '../useWorksheets';

export type SaveAsDialogProps = {
    ws: Worksheets;
    title: string;
    initialName: string;
    /** folder (relative to the project) to start in , '' = top level */
    initialDir: string;
    onSave: (name: string, dir: string) => Promise<Error | null>;
    onClose: () => void;
};

/**
 * Pick a file name and a folder of the project
 */
export function SaveAsDialog(p: SaveAsDialogProps) {
    const [name, setName] = React.useState(p.initialName);
    const [dir, setDir] = React.useState(p.initialDir);
    const [open, setOpen] = React.useState<Set<string>>(() => {
        // reveal the starting folder
        const s = new Set<string>();
        const parts = p.initialDir ? p.initialDir.split('/') : [];
        parts.forEach((_, i) => s.add(parts.slice(0, i + 1).join('/')));
        return s;
    });
    const [newFolder, setNewFolder] = React.useState<string | null>(null);
    const [error, setError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const dirs = p.ws.entries.filter((e) => e.dir);
    const rootName = p.ws.folder ? p.ws.folder.slice(p.ws.folder.lastIndexOf('/') + 1) : 'Project';

    const toggle = (rel: string) =>
        setOpen((s) => {
            const n = new Set(s);
            if (n.has(rel)) n.delete(rel);
            else n.add(rel);
            return n;
        });

    const createFolder = async () => {
        const value = (newFolder || '').trim();
        setNewFolder(null);
        if (!value) return;
        const { rel, err } = await p.ws.createFolder(dir, value);
        if (err) {
            setError(err.message);
            return;
        }
        if (dir) setOpen((s) => new Set(s).add(dir));
        setDir(rel);
    };

    const save = async () => {
        setSaving(true);
        setError('');
        const err = await p.onSave(name.trim(), dir);
        setSaving(false);
        if (err) setError(err.message);
    };

    const level = (parent: string, depth: number): React.ReactNode => (
        <>
            {newFolder !== null && dir === parent && (
                <div className="tree-row is-editing" style={{ paddingLeft: 8 + depth * 14 }}>
                    <span className="tree-chevron" />
                    <Folder size={14} className="tree-icon is-folder" />
                    <input
                        className="tree-input"
                        autoFocus
                        value={newFolder}
                        onChange={(ev) => setNewFolder(ev.target.value)}
                        onFocus={(ev) => ev.target.select()}
                        onBlur={createFolder}
                        onKeyDown={(ev) => {
                            if (ev.key === 'Enter') {
                                ev.preventDefault();
                                createFolder();
                            }
                            if (ev.key === 'Escape') {
                                ev.stopPropagation();
                                setNewFolder(null);
                            }
                        }}
                    />
                </div>
            )}
            {dirs
                .filter((d) => d.parent === parent)
                .map((d) => {
                    const isOpen = open.has(d.rel) || (newFolder !== null && dir === d.rel);
                    const hasChildren = dirs.some((c) => c.parent === d.rel);
                    return (
                        <React.Fragment key={d.rel}>
                            <div
                                className={`tree-row ${dir === d.rel ? 'is-selected' : ''}`}
                                style={{ paddingLeft: 8 + depth * 14 }}
                                onClick={() => setDir(d.rel)}
                                onDoubleClick={() => toggle(d.rel)}
                            >
                                <span
                                    className="tree-chevron"
                                    onClick={(ev) => {
                                        ev.stopPropagation();
                                        toggle(d.rel);
                                    }}
                                >
                                    {hasChildren ? isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                                </span>
                                {isOpen ? <FolderOpen size={14} className="tree-icon is-folder" /> : <Folder size={14} className="tree-icon is-folder" />}
                                <span className="tree-name">{d.name}</span>
                            </div>
                            {isOpen && level(d.rel, depth + 1)}
                        </React.Fragment>
                    );
                })}
        </>
    );

    const finalName = /\.[a-z0-9]+$/i.test(name.trim()) ? name.trim() : `${name.trim() || 'untitled'}.sql`;

    return (
        <Modal
            open
            wide
            icon={<Save size={16} />}
            title={p.title}
            submitLabel={saving ? 'Saving…' : 'Save'}
            submitDisabled={!name.trim() || saving}
            onClose={p.onClose}
            onSubmit={save}
        >
            <label className="field">
                <span className="field-label">Name</span>
                <input
                    className="app-input"
                    autoFocus
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    onFocus={(ev) => {
                        const dot = ev.target.value.lastIndexOf('.');
                        ev.target.setSelectionRange(0, dot > 0 ? dot : ev.target.value.length);
                    }}
                />
            </label>
            <div className="field">
                <span className="field-label save-where">
                    Saves to <code>{`${p.ws.folder}/${dir ? `${dir}/` : ''}${finalName}`}</code>
                    <button type="button" className="btn is-ghost" onClick={() => setNewFolder('New Folder')} title="New folder inside the selected one">
                        <FolderPlus size={13} /> New Folder
                    </button>
                </span>
                <div className="save-tree">
                    <div className={`tree-row ${dir === '' ? 'is-selected' : ''}`} style={{ paddingLeft: 8 }} onClick={() => setDir('')}>
                        <span className="tree-chevron" />
                        <FolderOpen size={14} className="tree-icon is-folder" />
                        <span className="tree-name">{rootName}</span>
                    </div>
                    {level('', 1)}
                </div>
            </div>
            {error && <div className="error-box">{error}</div>}
        </Modal>
    );
}
