import React from 'react';
import { ListFilter, Minus, Plus, X } from 'lucide-react';
import type { Filter } from 'renderer/api';
import type { GridColumn } from 'renderer/Components/DataGrid/DataGrid';

export type FilterMode = 'AND' | 'OR';
export type AppliedFilters = { mode: FilterMode; filters: Filter[] };

type FilterOp = {
    label: string;
    op: Filter['Operation'];
    /** no value input */
    unary?: boolean;
    /** two value inputs */
    range?: boolean;
    /** comma separated list */
    list?: boolean;
    wrap?: (v: string) => string;
};

/** escape LIKE wildcards in user input */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export const FILTER_OPS: FilterOp[] = [
    { label: '=', op: '=' },
    { label: '≠', op: '<>' },
    { label: 'contains', op: 'LIKE', wrap: (v) => `%${likeEscape(v)}%` },
    { label: "doesn't contain", op: 'NOT LIKE', wrap: (v) => `%${likeEscape(v)}%` },
    { label: 'starts with', op: 'LIKE', wrap: (v) => `${likeEscape(v)}%` },
    { label: 'ends with', op: 'LIKE', wrap: (v) => `%${likeEscape(v)}` },
    { label: '>', op: '>' },
    { label: '<', op: '<' },
    { label: '≥', op: '>=' },
    { label: '≤', op: '<=' },
    { label: 'between', op: 'BETWEEN', range: true },
    { label: 'in list', op: 'IN', list: true },
    { label: 'not in list', op: 'NOT IN', list: true },
    { label: 'LIKE', op: 'LIKE' },
    { label: 'NOT LIKE', op: 'NOT LIKE' },
    { label: 'is NULL', op: 'IS NULL', unary: true },
    { label: 'is not NULL', op: 'IS NOT NULL', unary: true },
];

type Draft = { id: number; column: string; op: number; value: string; value2: string };

let nextId = 1;
const newDraft = (column: string): Draft => ({ id: nextId++, column, op: 0, value: '', value2: '' });

const toFilter = (d: Draft): Filter | null => {
    const o = FILTER_OPS[d.op];
    if (!d.column) {
        return null;
    }
    if (o.unary) {
        return { Column: d.column, Operation: o.op, Value: null };
    }
    if (o.range) {
        return d.value === '' || d.value2 === ''
            ? null
            : { Column: d.column, Operation: o.op, Value: [d.value, d.value2] };
    }
    if (d.value === '') {
        return null;
    }
    if (o.list) {
        const list = d.value.split(',').map((v) => v.trim()).filter((v) => v !== '');
        return list.length ? { Column: d.column, Operation: o.op, Value: list } : null;
    }
    return { Column: d.column, Operation: o.op, Value: o.wrap ? o.wrap(d.value) : d.value };
};

export type FilterBarProps = {
    columns: GridColumn[];
    applied: AppliedFilters | null;
    onApply: (applied: AppliedFilters | null) => void;
};

/**
 * Condition builder : Where <col> <op> <value> and/or ...
 */
export function FilterBar(p: FilterBarProps) {
    const firstCol = p.columns[0]?.key || '';
    const [rows, setRows] = React.useState<Draft[]>(() => [newDraft(firstCol)]);
    const [mode, setMode] = React.useState<FilterMode>('AND');

    // new table => columns changed , start over
    const colSignature = p.columns.map((c) => c.key).join('|');
    React.useEffect(() => {
        setRows((rs) =>
            rs.some((r) => !p.columns.some((c) => c.key === r.column))
                ? [newDraft(firstCol)]
                : rs
        );
    }, [colSignature]);

    const update = (id: number, patch: Partial<Draft>) =>
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    const valid = rows.map(toFilter).filter(Boolean) as Filter[];
    const apply = () => p.onApply(valid.length ? { mode, filters: valid } : null);
    const clear = () => {
        setRows([newDraft(firstCol)]);
        p.onApply(null);
    };
    const onKey = (ev: React.KeyboardEvent) => ev.key === 'Enter' && apply();
    const joiner = mode === 'AND' ? 'and' : 'or';

    return (
        <div className="filterbar">
            {rows.map((r, i) => {
                const o = FILTER_OPS[r.op];
                return (
                    <div key={r.id} className="filter-row">
                        {i === 0 ? (
                            <span className="filter-prefix">
                                <ListFilter size={13} /> Where
                            </span>
                        ) : i === 1 ? (
                            <select
                                className="select filter-prefix-select"
                                value={mode}
                                onChange={(ev) => setMode(ev.target.value as FilterMode)}
                                title="How conditions combine"
                            >
                                <option value="AND">and</option>
                                <option value="OR">or</option>
                            </select>
                        ) : (
                            <span className="filter-prefix is-joiner">{joiner}</span>
                        )}
                        <select
                            className="select filter-col"
                            value={r.column}
                            onChange={(ev) => update(r.id, { column: ev.target.value })}
                        >
                            {p.columns.map((c) => (
                                <option key={c.key} value={c.key}>
                                    {c.key}
                                </option>
                            ))}
                        </select>
                        <select
                            className="select filter-op"
                            value={r.op}
                            onChange={(ev) => update(r.id, { op: +ev.target.value })}
                        >
                            {FILTER_OPS.map((op, idx) => (
                                <option key={op.label} value={idx}>
                                    {op.label}
                                </option>
                            ))}
                        </select>
                        {!o.unary && (
                            <input
                                className="app-input is-mono filter-value"
                                value={r.value}
                                placeholder={o.list ? 'a, b, c' : o.range ? 'from' : 'value'}
                                onChange={(ev) => update(r.id, { value: ev.target.value })}
                                onKeyDown={onKey}
                            />
                        )}
                        {o.range && (
                            <>
                                <span className="filter-and">and</span>
                                <input
                                    className="app-input is-mono filter-value"
                                    value={r.value2}
                                    placeholder="to"
                                    onChange={(ev) => update(r.id, { value2: ev.target.value })}
                                    onKeyDown={onKey}
                                />
                            </>
                        )}
                        {o.unary && <span className="filter-value" />}
                        <button
                            type="button"
                            className="icon-btn is-small"
                            title="Remove condition"
                            disabled={rows.length === 1}
                            onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                        >
                            <Minus size={13} />
                        </button>
                        {i === rows.length - 1 ? (
                            <button
                                type="button"
                                className="icon-btn is-small"
                                title="Add condition"
                                onClick={() => setRows((rs) => [...rs, newDraft(r.column)])}
                            >
                                <Plus size={13} />
                            </button>
                        ) : (
                            <span className="icon-btn is-small" />
                        )}
                        {i === 0 && (
                            <span className="filter-actions">
                                {p.applied && (
                                    <button type="button" className="btn is-ghost" onClick={clear}>
                                        <X size={13} /> Clear
                                    </button>
                                )}
                                <button type="button" className="btn" onClick={apply}>
                                    Filter
                                    {valid.length > 1 ? ` (${valid.length})` : ''}
                                </button>
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
