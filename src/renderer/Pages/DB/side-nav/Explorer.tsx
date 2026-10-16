import React from 'react';
import {
    ChevronDown,
    ChevronRight,
    Copy,
    File,
    FileCode2,
    FilePlus2,
    Folder,
    FolderInput,
    FolderOpen,
    FolderPlus,
    FolderSearch,
    ListCollapse,
    Pencil,
    RefreshCw,
    SquareTerminal,
    Trash2,
} from 'lucide-react';
import type { FsEntry } from 'renderer/api';
import { ContextMenu, MenuEntry, useContextMenu } from 'renderer/Components/ui/ContextMenu';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';
import { dirOf, TEXT_FILE, Worksheets } from '../useWorksheets';

type Sel = { rel: string; dir: boolean } | null;
type Editing =
    | { mode: 'new-file' | 'new-folder'; parent: string; value: string }
    | { mode: 'rename'; rel: string; dir: boolean; value: string }
    | null;

const DND_TYPE = 'application/x-sequel-fidl-path';
const INDENT = 12;

export type ExplorerProps = {
    ws: Worksheets;
    scope: string;
    /** connection label , for the folder dialog */
    label: string;
    /** a file was opened (switch to the editor) */
    onShowEditor: () => void;
    /** open the terminal in a folder (absolute path) */
    onOpenTerminal: (cwd: string) => void;
};

/**
 * VS Code style explorer of the connection's project folder on disk
 */
export function useExplorer({ ws, scope, label, onShowEditor, onOpenTerminal }: ExplorerProps): {
    title: string;
    actions: React.ReactNode;
    body: React.ReactNode;
} {
    const notify = useToast();
    const menu = useContextMenu();
    const expandedKey = `sequel-fidl.explorer-fs.${scope}`;
    const [expanded, setExpanded] = React.useState<Set<string>>(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(expandedKey) || '[]'));
        } catch (e) {
            return new Set();
        }
    });
    const [selected, setSelected] = React.useState<Sel>(null);
    const [editing, setEditing] = React.useState<Editing>(null);
    const [dropTarget, setDropTarget] = React.useState<string | null>(null);
    const [confirm, setConfirm] = React.useState<{ rel: string; dir: boolean } | null>(null);

    React.useEffect(() => {
        try {
            localStorage.setItem(expandedKey, JSON.stringify(Array.from(expanded)));
        } catch (e) {}
    }, [expanded]);

    const expand = (rel: string, openIt = true) =>
        setExpanded((s) => {
            const n = new Set(s);
            if (openIt) n.add(rel);
            else n.delete(rel);
            return n;
        });

    /** where new things go : the selected folder , or the folder of the selected file */
    const targetDir = () => (selected ? (selected.dir ? selected.rel : dirOf(selected.rel)) : '');
    const report = (err: Error | null) => {
        if (err) notify(err.message, 'error');
    };

    const startNew = (mode: 'new-file' | 'new-folder', parent: string) => {
        if (parent) expand(parent);
        setEditing({ mode, parent, value: mode === 'new-file' ? 'untitled.sql' : 'New Folder' });
    };

    const commit = async () => {
        const e = editing;
        setEditing(null);
        if (!e || !e.value.trim()) return;
        if (e.mode === 'new-file') {
            const err = await ws.createFile(e.parent, e.value.trim());
            report(err);
            if (!err) onShowEditor();
        } else if (e.mode === 'new-folder') {
            const { rel, err } = await ws.createFolder(e.parent, e.value.trim());
            report(err);
            if (rel) setSelected({ rel, dir: true });
        } else if (e.mode === 'rename' && e.value.trim() !== e.rel.slice(e.rel.lastIndexOf('/') + 1)) {
            report(await ws.rename(e.rel, e.value.trim()));
        }
    };

    const openEntry = async (entry: FsEntry) => {
        const err = await ws.openFile(entry.rel);
        report(err);
        if (!err && TEXT_FILE.test(entry.rel)) onShowEditor();
    };

    // ---- drag & drop : inside the tree = move , from Finder = copy
    const drop = async (ev: React.DragEvent, dir: string) => {
        ev.preventDefault();
        ev.stopPropagation();
        setDropTarget(null);
        const internal = ev.dataTransfer.getData(DND_TYPE);
        if (internal) {
            const name = internal.slice(internal.lastIndexOf('/') + 1);
            if (dirOf(internal) === dir || internal === dir) return;
            report(await ws.move(internal, dir ? `${dir}/${name}` : name));
        } else {
            // electron adds the real path to files dropped from Finder
            const sources = Array.from(ev.dataTransfer.files)
                .map((f) => (f as File & { path?: string }).path)
                .filter(Boolean);
            if (!sources.length) return;
            const { copied, err } = await ws.copyIn(sources, dir);
            if (err) report(err);
            else notify(`Copied ${copied.length} item${copied.length === 1 ? '' : 's'} into ${dir || 'the project'}`, 'success');
        }
        if (dir) expand(dir);
    };
    const dragOver = (ev: React.DragEvent, target: string) => {
        const types = Array.from(ev.dataTransfer.types);
        if (!types.includes(DND_TYPE) && !types.includes('Files')) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = types.includes(DND_TYPE) ? 'move' : 'copy';
        setDropTarget(target);
    };

    const copyText = (text: string, what: string) =>
        navigator.clipboard.writeText(text).then(() => notify(`Copied ${what}`, 'success'));

    const entryMenu = (e: FsEntry): MenuEntry[] => [
        ...((e.dir
            ? [
                  { label: 'New File', icon: <FilePlus2 size={14} />, onSelect: () => startNew('new-file', e.rel) },
                  { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => startNew('new-folder', e.rel) },
                  'separator',
              ]
            : [{ label: 'Open', icon: <FileCode2 size={14} />, onSelect: () => openEntry(e) }, 'separator']) as MenuEntry[]),
        { label: 'Reveal in Finder', icon: <FolderSearch size={14} />, onSelect: () => ws.reveal(e.rel) },
        {
            label: 'Open in Terminal',
            icon: <SquareTerminal size={14} />,
            onSelect: () => onOpenTerminal(ws.absPath(e.dir ? e.rel : dirOf(e.rel))),
        },
        'separator',
        { label: 'Copy Path', icon: <Copy size={14} />, onSelect: () => copyText(ws.absPath(e.rel), 'path') },
        { label: 'Copy Relative Path', icon: <Copy size={14} />, onSelect: () => copyText(e.rel, 'relative path') },
        'separator',
        { label: 'Rename', icon: <Pencil size={14} />, kbd: '↵', onSelect: () => setEditing({ mode: 'rename', rel: e.rel, dir: e.dir, value: e.name }) },
        { label: 'Move to Trash', icon: <Trash2 size={14} />, danger: true, kbd: '⌘⌫', onSelect: () => setConfirm({ rel: e.rel, dir: e.dir }) },
    ];

    const editor = (depth: number, icon: React.ReactNode) => (
        <div className="tree-row is-editing" style={{ paddingLeft: 8 + depth * INDENT }}>
            <span className="tree-chevron" />
            {icon}
            <input
                className="tree-input"
                autoFocus
                value={editing?.value || ''}
                onChange={(ev) => setEditing((e) => e && { ...e, value: ev.target.value })}
                onFocus={(ev) => {
                    // select the name without its extension , like Finder
                    const v = ev.target.value;
                    const dot = v.lastIndexOf('.');
                    ev.target.setSelectionRange(0, dot > 0 ? dot : v.length);
                }}
                onBlur={commit}
                onKeyDown={(ev) => {
                    if (ev.key === 'Enter') commit();
                    if (ev.key === 'Escape') setEditing(null);
                }}
            />
        </div>
    );

    const onRowKey = (ev: React.KeyboardEvent, e: FsEntry) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            setEditing({ mode: 'rename', rel: e.rel, dir: e.dir, value: e.name });
        } else if (ev.key === 'Backspace' && ev.metaKey) {
            ev.preventDefault();
            setConfirm({ rel: e.rel, dir: e.dir });
        }
    };

    const folderIcon = (openIt: boolean) =>
        openIt ? <FolderOpen size={14} className="tree-icon is-folder" /> : <Folder size={14} className="tree-icon is-folder" />;

    const level = (parent: string, depth: number): React.ReactNode => {
        const items = ws.entries.filter((e) => e.parent === parent);
        const creating = editing && editing.mode !== 'rename' && editing.parent === parent ? editing : null;
        return (
            <>
                {creating?.mode === 'new-folder' && editor(depth, folderIcon(false))}
                {creating?.mode === 'new-file' && editor(depth, <FileCode2 size={14} className="tree-icon" />)}
                {items.map((e) => {
                    const isOpen = e.dir && expanded.has(e.rel);
                    if (editing?.mode === 'rename' && editing.rel === e.rel) {
                        return (
                            <React.Fragment key={e.rel}>
                                {editor(depth, e.dir ? folderIcon(false) : <FileCode2 size={14} className="tree-icon" />)}
                                {isOpen && level(e.rel, depth + 1)}
                            </React.Fragment>
                        );
                    }
                    const active = !e.dir && ws.active?.rel === e.rel;
                    return (
                        <React.Fragment key={e.rel}>
                            <div
                                className={`tree-row ${active ? 'is-active' : ''} ${selected?.rel === e.rel ? 'is-selected' : ''} ${
                                    dropTarget === e.rel ? 'is-drop' : ''
                                }`}
                                style={{ paddingLeft: 8 + depth * INDENT }}
                                tabIndex={0}
                                draggable
                                onDragStart={(ev) => {
                                    ev.dataTransfer.setData(DND_TYPE, e.rel);
                                    ev.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(ev) => dragOver(ev, e.dir ? e.rel : e.parent)}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={(ev) => drop(ev, e.dir ? e.rel : e.parent)}
                                onClick={() => {
                                    setSelected({ rel: e.rel, dir: e.dir });
                                    if (e.dir) expand(e.rel, !isOpen);
                                    else openEntry(e);
                                }}
                                onKeyDown={(ev) => onRowKey(ev, e)}
                                onContextMenu={(ev) => {
                                    setSelected({ rel: e.rel, dir: e.dir });
                                    menu.open(ev, entryMenu(e));
                                }}
                                title={ws.absPath(e.rel)}
                            >
                                <span className="tree-chevron">
                                    {e.dir ? isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                                </span>
                                {e.dir ? (
                                    folderIcon(isOpen)
                                ) : TEXT_FILE.test(e.name) ? (
                                    <FileCode2 size={14} className="tree-icon" />
                                ) : (
                                    <File size={14} className="tree-icon" />
                                )}
                                <span className="tree-name">{e.name}</span>
                            </div>
                            {isOpen && level(e.rel, depth + 1)}
                        </React.Fragment>
                    );
                })}
            </>
        );
    };

    if (!ws.folder) {
        return {
            title: 'Explorer',
            actions: null,
            body: (
                <div className="app-tree">
                    <div className="explorer-empty">
                        <p>No project folder yet. SQL files for this connection are saved in a folder you pick.</p>
                        <button type="button" className="btn is-primary" onClick={() => ws.chooseFolder(label).then(report)}>
                            <FolderInput size={13} /> Open Folder…
                        </button>
                    </div>
                </div>
            ),
        };
    }

    return {
        title: ws.folder.slice(ws.folder.lastIndexOf('/') + 1),
        actions: (
            <span className="sidebar-actions">
                <button type="button" className="icon-btn is-small" title="New File" onClick={() => startNew('new-file', targetDir())}>
                    <FilePlus2 size={14} />
                </button>
                <button type="button" className="icon-btn is-small" title="New Folder" onClick={() => startNew('new-folder', targetDir())}>
                    <FolderPlus size={14} />
                </button>
                <button type="button" className="icon-btn is-small" title="Refresh" onClick={() => ws.reload()}>
                    <RefreshCw size={13} />
                </button>
                <button type="button" className="icon-btn is-small" title="Collapse Folders" onClick={() => setExpanded(new Set())}>
                    <ListCollapse size={14} />
                </button>
                <button type="button" className="icon-btn is-small" title="Open Another Folder… (⌘O)" onClick={() => ws.chooseFolder(label).then(report)}>
                    <FolderInput size={14} />
                </button>
            </span>
        ),
        body: (
            <div
                className={`app-tree ${dropTarget === '' ? 'is-drop' : ''}`}
                onDragOver={(ev) => dragOver(ev, '')}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(ev) => drop(ev, '')}
                onClick={(ev) => ev.target === ev.currentTarget && setSelected(null)}
                onContextMenu={(ev) => {
                    if (ev.target !== ev.currentTarget) return;
                    setSelected(null);
                    menu.open(ev, [
                        { label: 'New File', icon: <FilePlus2 size={14} />, onSelect: () => startNew('new-file', '') },
                        { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => startNew('new-folder', '') },
                        'separator',
                        { label: 'Reveal in Finder', icon: <FolderSearch size={14} />, onSelect: () => ws.reveal('') },
                        { label: 'Open in Terminal', icon: <SquareTerminal size={14} />, onSelect: () => onOpenTerminal(ws.folder) },
                        { label: 'Copy Path', icon: <Copy size={14} />, onSelect: () => copyText(ws.folder, 'path') },
                        'separator',
                        { label: 'Open Another Folder…', icon: <FolderInput size={14} />, onSelect: () => ws.chooseFolder(label).then(report) },
                    ]);
                }}
            >
                {level('', 0)}
                {!ws.entries.length && !editing && (
                    <div className="sidebar-empty">Empty folder. ⌘N starts a file , or drop files here from Finder.</div>
                )}
                <ContextMenu {...menu} />
                <Modal
                    open={!!confirm}
                    icon={<Trash2 size={16} />}
                    title={<span>Move {confirm && <code>{confirm.rel.slice(confirm.rel.lastIndexOf('/') + 1)}</code>} to the Trash?</span>}
                    submitLabel="Move to Trash"
                    danger
                    onClose={() => setConfirm(null)}
                    onSubmit={() => {
                        const c = confirm;
                        setConfirm(null);
                        ws.trash(c.rel).then((err) => (err ? report(err) : notify('Moved to the Trash', 'success')));
                    }}
                >
                    {confirm?.dir ? 'The folder and everything in it go' : 'It goes'} to the Trash , you can put it back
                    from Finder.
                </Modal>
            </div>
        ),
    };
}
