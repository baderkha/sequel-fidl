import React from 'react';
import { FileCode2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { ContextMenu, MenuEntry, useContextMenu } from 'renderer/Components/ui/ContextMenu';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';
import type { Doc, Worksheets } from '../useWorksheets';

export type WorksheetTabsProps = {
    ws: Worksheets;
    onNew: () => void;
    /** save a copy */
    onSave: (doc: Doc) => void;
};

/**
 * Open project files as editor tabs , a dot while changes are being saved
 */
export function WorksheetTabs({ ws, onNew, onSave }: WorksheetTabsProps) {
    const menu = useContextMenu();
    const notify = useToast();
    const [editing, setEditing] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState('');
    const [deleting, setDeleting] = React.useState<Doc | null>(null);

    const startRename = (d: Doc) => {
        setEditing(d.id);
        setDraft(d.name);
    };
    const finishRename = () => {
        const doc = ws.openDocs.find((d) => d.id === editing);
        if (doc && draft.trim() && draft.trim() !== doc.name) {
            ws.renameDoc(doc, draft.trim()).then((err) => err && notify(err.message, 'error'));
        }
        setEditing(null);
    };

    const tabMenu = (d: Doc): MenuEntry[] => [
        { label: 'Save a Copy…', icon: <Save size={14} />, kbd: '⇧⌘S', onSelect: () => onSave(d) },
        { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => startRename(d) },
        { label: 'Close', icon: <X size={14} />, onSelect: () => ws.close(d.id) },
        'separator',
        { label: 'Move to Trash…', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(d) },
    ];

    const remove = (d: Doc) =>
        ws.trash(d.rel).then((err) => (err ? notify(err.message, 'error') : notify(`Moved ${d.name} to the Trash`, 'success')));

    return (
        <div className="sheet-tabs">
            {ws.openDocs.map((d) => {
                const dirty = ws.isDirty(d);
                return (
                    <div
                        key={d.id}
                        className={`sheet-tab ${ws.active?.id === d.id ? 'is-active' : ''} ${dirty ? 'is-dirty' : ''}`}
                        onMouseDown={(ev) => ev.button === 0 && ws.open(d.id)}
                        onAuxClick={(ev) => ev.button === 1 && ws.close(d.id)}
                        onDoubleClick={() => startRename(d)}
                        onContextMenu={(ev) => menu.open(ev, tabMenu(d))}
                        title={ws.absPath(d.rel)}
                    >
                        <FileCode2 size={13} className="sheet-tab-icon" />
                        {editing === d.id ? (
                            <input
                                className="sheet-tab-input"
                                autoFocus
                                value={draft}
                                onChange={(ev) => setDraft(ev.target.value)}
                                onFocus={(ev) => ev.target.select()}
                                onBlur={finishRename}
                                onKeyDown={(ev) => {
                                    if (ev.key === 'Enter') finishRename();
                                    if (ev.key === 'Escape') setEditing(null);
                                }}
                                onMouseDown={(ev) => ev.stopPropagation()}
                            />
                        ) : (
                            <span className="sheet-tab-name">{d.name}</span>
                        )}
                        {dirty && <span className="sheet-tab-dirty" title="Saving…" />}
                        <button
                            type="button"
                            className="sheet-tab-close"
                            title="Close (the file stays in the folder , reopen it from the explorer or ⌘P)"
                            onMouseDown={(ev) => ev.stopPropagation()}
                            onClick={() => ws.close(d.id)}
                        >
                            <X size={12} />
                        </button>
                    </div>
                );
            })}
            <button type="button" className="icon-btn is-small sheet-new" title="New file (⌘N)" onClick={onNew}>
                <Plus size={14} />
            </button>
            <ContextMenu {...menu} />
            <Modal
                open={!!deleting}
                icon={<Trash2 size={16} />}
                title={<span>Move {deleting && <code>{deleting.name}</code>} to the Trash?</span>}
                submitLabel="Move to Trash"
                danger
                onClose={() => setDeleting(null)}
                onSubmit={() => {
                    const d = deleting;
                    setDeleting(null);
                    remove(d);
                }}
            >
                You can put it back from the Trash in Finder.
            </Modal>
        </div>
    );
}
