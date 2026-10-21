import React from 'react';
import { Braces, ChevronLeft, CircleAlert } from 'lucide-react';
import type { ColSchema, ColumnAssignment } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { ConfirmSQL, KeyInfo, pick, updateSQL } from './RowActions';
import { parseDocumentJSON, recordAssignments, RecordDocument, toRecordDocument } from './documentValues';

export function RecordEditor(p: {
    row: Record<string, any>;
    table: string;
    schema: ColSchema[];
    keyInfo: KeyInfo;
    warning?: string;
    onClose: () => void;
    onSave: (assignments: ColumnAssignment[]) => Promise<string | null>;
}) {
    const before = React.useMemo(() => toRecordDocument(p.row, p.schema), [p.row, p.schema]);
    const [draft, setDraft] = React.useState(() => JSON.stringify(before, null, 2));
    const [review, setReview] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const result = React.useMemo(() => {
        try {
            const next = parseDocumentJSON(draft);
            const assignments = recordAssignments(p.row, p.schema, next);
            return { assignments, next: next as RecordDocument, error: '' };
        } catch (err) {
            return { assignments: [] as ColumnAssignment[], next: before, error: (err as Error).message };
        }
    }, [draft, before, p.row, p.schema]);

    if (review) {
        return (
            <ConfirmSQL
                icon={<Braces size={16} />}
                title={<>Update record in <code>{p.table}</code>?</>}
                submitLabel="Update record"
                warning={p.warning}
                sql={updateSQL(p.table, result.assignments, [pick(p.row, p.keyInfo.cols)], p.keyInfo)}
                onClose={p.onClose}
                onSubmit={async () => {
                    setSaving(true);
                    try {
                        return await p.onSave(result.assignments);
                    } catch (err) {
                        return (err as Error).message;
                    } finally {
                        setSaving(false);
                    }
                }}
            >
                <div><button type="button" className="btn is-ghost" disabled={saving} onClick={() => setReview(false)}><ChevronLeft size={13} /> Back to editing</button></div>
                <div className="record-changes">
                    <div className="record-change-heading"><span>Field</span><span>Before</span><span>After</span></div>
                    {result.assignments.map((assignment) => (
                        <div className="record-change" key={assignment.column}>
                            <code>{assignment.column}</code>
                            <pre>{JSON.stringify(before[assignment.column], null, 2)}</pre>
                            <pre>{JSON.stringify(result.next[assignment.column], null, 2)}</pre>
                        </div>
                    ))}
                </div>
            </ConfirmSQL>
        );
    }

    return (
        <Modal
            open
            wide
            icon={<Braces size={16} />}
            title={<>Edit record in <code>{p.table}</code></>}
            submitLabel={result.assignments.length ? 'Review changes' : 'Done'}
            submitDisabled={!!result.error}
            onClose={p.onClose}
            onSubmit={() => result.assignments.length ? setReview(true) : p.onClose()}
        >
            <p className="toolbar-text">Edit column values below. Nested objects and arrays are supported in JSON columns. Changes are reviewed before saving.</p>
            <textarea
                className="app-input record-json-editor"
                aria-label="Record JSON"
                autoFocus
                spellCheck={false}
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                onKeyDown={(ev) => ev.stopPropagation()}
            />
            {result.error && <div className="error-box" role="alert"><CircleAlert size={15} />{result.error}</div>}
        </Modal>
    );
}
