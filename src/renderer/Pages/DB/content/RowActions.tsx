import React from 'react';
import { CircleAlert, Copy, Files, PenLine, Plus, Trash2, X } from 'lucide-react';
import type { ColSchema, ColumnAssignment } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { SqlEditor } from 'renderer/Components/SqlEditor/SqlEditor';
import { cellToText } from 'renderer/Components/DataGrid/format';
import { sqlFor } from 'renderer/util/sql';
import type { DatabaseType } from 'shared/db/dialects';

/** how rows of a table are identified for UPDATE / DELETE */
export type KeyInfo = {
    jsonCols?: string[];
    cols: string[];
    /** no primary / unique key : rows are matched on every column , one at a time */
    byAll: boolean;
};

export const keyInfoFor = (schema: ColSchema[]): KeyInfo => {
    const jsonCols = schema.filter((c) => /^jsonb?\b/i.test(c.Type)).map((c) => c.FieldName);
    const pk = schema.filter((c) => c.IsPrimaryKey).map((c) => c.FieldName);
    if (pk.length) {
        return { cols: pk, byAll: false, jsonCols };
    }
    const unique = schema.find((c) => c.IsUnique && !c.NullAllowed);
    if (unique) {
        return { cols: [unique.FieldName], byAll: false, jsonCols };
    }
    return { cols: schema.map((c) => c.FieldName), byAll: true, jsonCols };
};

export const pick = (row: any, cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, row[c]]));

const PREVIEW_ROWS = 5;
const BATCH = 500;

const more = (n: number, what: string) => (n > 0 ? `\n-- … and ${n.toLocaleString()} more ${what}` : '');

export function deleteSQL(table: string, keys: Record<string, any>[], key: KeyInfo, dialect: DatabaseType = 'mysql') {
    const { table: ident, keysWhere } = sqlFor(dialect,key.jsonCols);
    if (key.byAll) {
        return (
            keys
                .slice(0, PREVIEW_ROWS)
                .map((k) => dialect === 'postgres' ? `DELETE FROM ${ident(table)} WHERE (tableoid,ctid) IN (SELECT tableoid,ctid FROM ${ident(table)} WHERE ${keysWhere([k])} LIMIT 1 FOR UPDATE);` : `DELETE FROM ${ident(table)} WHERE ${keysWhere([k])} LIMIT 1;`)
                .join('\n') + more(keys.length - PREVIEW_ROWS, 'statements (one per row)')
        );
    }
    const shown = keys.slice(0, BATCH);
    return `DELETE FROM ${ident(table)}\nWHERE ${keysWhere(shown)};${more(
        keys.length - shown.length,
        `rows , sent in batches of ${BATCH}`
    )}`;
}

const assignmentSQL = (a: ColumnAssignment, dialect: DatabaseType = 'mysql') => {
    const { ident, literal } = sqlFor(dialect);
    switch (a.mode) {
        case 'null':
            return `${ident(a.column)} = NULL`;
        case 'default':
            return `${ident(a.column)} = DEFAULT`;
        case 'expression':
            return `${ident(a.column)} = ${a.value || '…'}`;
        default:
            return `${ident(a.column)} = ${literal(a.value ?? '')}`;
    }
};

export function updateSQL(
    table: string,
    set: ColumnAssignment[],
    keys: Record<string, any>[],
    key: KeyInfo,
    dialect: DatabaseType = 'mysql'
) {
    const { table: ident, keysWhere } = sqlFor(dialect,key.jsonCols);
    const head = `UPDATE ${ident(table)}\nSET ${set.map((a) => assignmentSQL(a,dialect)).join(',\n    ')}`;
    if (key.byAll) {
        return (
            keys
                .slice(0, PREVIEW_ROWS)
                .map((k) => dialect === 'postgres' ? `${head}\nWHERE (tableoid,ctid) IN (SELECT tableoid,ctid FROM ${ident(table)} WHERE ${keysWhere([k])} LIMIT 1 FOR UPDATE);` : `${head}\nWHERE ${keysWhere([k])} LIMIT 1;`)
                .join('\n\n') + more(keys.length - PREVIEW_ROWS, 'statements (one per row)')
        );
    }
    const shown = keys.slice(0, BATCH);
    return `${head}\nWHERE ${keysWhere(shown)};${more(keys.length - shown.length, `rows , sent in batches of ${BATCH}`)}`;
}

export function insertSQL(table: string, columns: string[], rows: any[], dialect: DatabaseType = 'mysql', schema: ColSchema[] = []) {
    const { ident, table: tableIdent, literal } = sqlFor(dialect);
    if (!rows.length) {
        return '';
    }
    if (!columns.length && dialect === 'postgres') return rows.map(() => `INSERT INTO ${tableIdent(table)} DEFAULT VALUES;`).join('\n');
    const values = rows.map((r) => `  (${columns.map((c) => literal(dialect === 'postgres' && /^jsonb?\b/i.test(schema.find((s) => s.FieldName === c)?.Type || '') && r[c] !== null ? JSON.stringify(r[c]) : r[c])).join(', ')})`);
    return `INSERT INTO ${tableIdent(table)} (${columns.map(ident).join(', ')})\nVALUES\n${values.join(',\n')};`;
}

const csvCell = (v: any, sep: string) => {
    if (v === null || v === undefined) {
        return '';
    }
    const text = cellToText(v);
    return sep === '\t'
        ? text.replace(/[\t\n\r]+/g, ' ')
        : /[",\n\r]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
};

export type CopyFormat = 'sql' | 'csv' | 'tsv' | 'json';

export function rowsAs(format: CopyFormat, table: string, columns: string[], rows: any[], dialect: DatabaseType = 'mysql', schema: ColSchema[] = []): string {
    switch (format) {
        case 'sql':
            return insertSQL(table, columns, rows,dialect,schema);
        case 'json':
            return JSON.stringify(
                rows.map((r) =>
                    Object.fromEntries(
                        columns.map((c) => [
                            c,
                            r[c] instanceof Date || r[c] instanceof Uint8Array ? cellToText(r[c]) : r[c],
                        ])
                    )
                ),
                null,
                2
            );
        default: {
            const sep = format === 'csv' ? ',' : '\t';
            return [columns.join(sep), ...rows.map((r) => columns.map((c) => csvCell(r[c], sep)).join(sep))].join('\n');
        }
    }
}

/**
 * Floating bar shown while rows are selected
 */
export function BulkBar(p: {
    count: number;
    onSetValue: () => void;
    onDuplicate: () => void;
    onCopy: (ev: React.MouseEvent) => void;
    onDelete: () => void;
    onClear: () => void;
}) {
    return (
        <div className="bulkbar">
            <span className="bulkbar-count">
                {p.count.toLocaleString()} row{p.count === 1 ? '' : 's'} selected
            </span>
            <button type="button" className="btn is-ghost" onClick={p.onSetValue}>
                <PenLine size={13} /> Set value…
            </button>
            <button type="button" className="btn is-ghost" onClick={p.onDuplicate}>
                <Files size={13} /> Duplicate
            </button>
            <button type="button" className="btn is-ghost" onClick={p.onCopy}>
                <Copy size={13} /> Copy as…
            </button>
            <button type="button" className="btn is-danger-ghost" onClick={p.onDelete}>
                <Trash2 size={13} /> Delete
            </button>
            <button type="button" className="icon-btn is-small" title="Clear selection (esc)" onClick={p.onClear}>
                <X size={13} />
            </button>
        </div>
    );
}

/**
 * Confirm a data change , showing the statement that will run
 */
export function ConfirmSQL(p: {
    title: React.ReactNode;
    icon: React.ReactNode;
    sql: string;
    submitLabel: string;
    danger?: boolean;
    warning?: string;
    children?: React.ReactNode;
    disabled?: boolean;
    onClose: () => void;
    /** resolves to an error message , or null when it worked */
    onSubmit: () => Promise<string | null>;
}) {
    const [running, setRunning] = React.useState(false);
    const [error, setError] = React.useState('');
    const submit = () => {
        setRunning(true);
        setError('');
        p.onSubmit().then((err) => {
            setRunning(false);
            if (err) {
                setError(err);
            }
        });
    };
    return (
        <Modal
            open
            wide
            icon={p.icon}
            title={p.title}
            submitLabel={running ? 'Running…' : p.submitLabel}
            submitDisabled={running || p.disabled}
            danger={p.danger}
            onClose={() => !running && p.onClose()}
            onSubmit={submit}
        >
            {p.children}
            {p.warning && (
                <div className="banner is-warning">
                    <CircleAlert size={15} />
                    <span>{p.warning}</span>
                </div>
            )}
            <div className="preview-sql">
                <SqlEditor value={p.sql} readOnly />
            </div>
            {error && (
                <div className="error-box">
                    <CircleAlert size={15} />
                    {error}
                </div>
            )}
        </Modal>
    );
}

/**
 * Editor for the SET part of a bulk update
 */
export function AssignmentsEditor(p: {
    columns: string[];
    value: ColumnAssignment[];
    onChange: (v: ColumnAssignment[]) => void;
}) {
    const update = (i: number, patch: Partial<ColumnAssignment>) =>
        p.onChange(p.value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
    return (
        <div className="field">
            {p.value.map((a, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="assign-row">
                    <select className="select" value={a.column} onChange={(ev) => update(i, { column: ev.target.value })}>
                        {p.columns.map((c) => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                    <select
                        className="select"
                        value={a.mode}
                        onChange={(ev) => update(i, { mode: ev.target.value as ColumnAssignment['mode'] })}
                    >
                        <option value="value">= value</option>
                        <option value="null">= NULL</option>
                        <option value="default">= DEFAULT</option>
                        <option value="expression">= expression</option>
                    </select>
                    <input
                        className="app-input is-mono"
                        autoFocus={i === p.value.length - 1}
                        disabled={a.mode === 'null' || a.mode === 'default'}
                        placeholder={a.mode === 'expression' ? 'e.g. NOW() or price * 1.1' : a.mode === 'value' ? 'new value' : ''}
                        value={a.mode === 'null' || a.mode === 'default' ? '' : a.value ?? ''}
                        onChange={(ev) => update(i, { value: ev.target.value })}
                    />
                    <button
                        type="button"
                        className="icon-btn is-small"
                        title="Remove"
                        disabled={p.value.length === 1}
                        onClick={() => p.onChange(p.value.filter((_, j) => j !== i))}
                    >
                        <X size={13} />
                    </button>
                </div>
            ))}
            <div>
                <button
                    type="button"
                    className="btn is-ghost"
                    onClick={() =>
                        p.onChange([
                            ...p.value,
                            { column: p.columns.find((c) => !p.value.some((a) => a.column === c)) || p.columns[0], mode: 'value', value: '' },
                        ])
                    }
                >
                    <Plus size={13} /> Another column
                </button>
            </div>
        </div>
    );
}
