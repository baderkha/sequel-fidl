import React from 'react';
import { Eraser, Files, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

export type TableAction =
    | { kind: 'clone'; table: string }
    | { kind: 'rename'; table: string }
    | { kind: 'truncate'; table: string }
    | { kind: 'drop'; table: string };

export type TableActionDialogsProps = {
    action: TableAction | null;
    onClose: () => void;
    onClone: (table: string, newName: string, copyData: boolean) => void;
    onRename: (table: string, newName: string) => void;
    onTruncate: (table: string) => void;
    onDrop: (table: string) => void;
};

/**
 * Clone / rename / truncate / drop dialogs for the sidebar context menu
 */
export function TableActionDialogs(p: TableActionDialogsProps) {
    const [name, setName] = React.useState('');
    const [copyData, setCopyData] = React.useState(false);

    React.useEffect(() => {
        if (p.action?.kind === 'clone') {
            setName(`${p.action.table}_copy`);
            setCopyData(false);
        } else if (p.action?.kind === 'rename') {
            setName(p.action.table);
        }
    }, [p.action]);

    const a = p.action;
    const table = a ? <code>{a.table}</code> : null;
    const nameValid = name.trim() !== '' && name.trim() !== a?.table;

    return (
        <>
            <Modal
                open={a?.kind === 'clone'}
                icon={<Files size={16} />}
                title={<span>Duplicate {table}</span>}
                submitLabel="Duplicate"
                submitDisabled={!nameValid}
                onClose={p.onClose}
                onSubmit={() => p.onClone(a.table, name.trim(), copyData)}
            >
                <label className="field">
                    <span className="field-label">New table name</span>
                    <input
                        className="app-input is-mono"
                        autoFocus
                        value={name}
                        onChange={(ev) => setName(ev.target.value)}
                        onFocus={(ev) => ev.target.select()}
                    />
                </label>
                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={copyData}
                        onChange={(ev) => setCopyData(ev.target.checked)}
                    />
                    Copy table content
                </label>
            </Modal>
            <Modal
                open={a?.kind === 'rename'}
                icon={<Pencil size={16} />}
                title={<span>Rename {table}</span>}
                submitLabel="Rename"
                submitDisabled={!nameValid}
                onClose={p.onClose}
                onSubmit={() => p.onRename(a.table, name.trim())}
            >
                <label className="field">
                    <span className="field-label">New name</span>
                    <input
                        className="app-input is-mono"
                        autoFocus
                        value={name}
                        onChange={(ev) => setName(ev.target.value)}
                        onFocus={(ev) => ev.target.select()}
                    />
                </label>
            </Modal>
            <Modal
                open={a?.kind === 'truncate'}
                icon={<Eraser size={16} />}
                title={<span>Truncate {table}?</span>}
                submitLabel="Truncate"
                danger
                onClose={p.onClose}
                onSubmit={() => p.onTruncate(a.table)}
            >
                Every row in {table} will be deleted. The table structure is kept.
                This can't be undone.
            </Modal>
            <Modal
                open={a?.kind === 'drop'}
                icon={<Trash2 size={16} />}
                title={<span>Drop {table}?</span>}
                submitLabel="Drop Table"
                danger
                onClose={p.onClose}
                onSubmit={() => p.onDrop(a.table)}
            >
                {table} and all of its data will be permanently deleted. This can't be
                undone.
            </Modal>
        </>
    );
}
