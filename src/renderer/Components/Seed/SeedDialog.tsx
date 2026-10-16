import React from 'react';
import { CircleAlert, RefreshCw, Sparkles, Table2 } from 'lucide-react';
import { api, ColSchema } from 'renderer/api';
import { DataGrid } from '../DataGrid/DataGrid';
import { SqlEditor } from '../SqlEditor/SqlEditor';
import { ident, str } from '../CreateTable/model';
import {
    castValue,
    ColumnInfo,
    columnInfo,
    generator,
    GENERATOR_GROUPS,
    GENERATORS,
    GenParams,
    suggest,
} from './generators';

export type SeedDialogProps = {
    conID: string;
    table: string;
    tables: string[];
    getSchema: (table: string) => Promise<ColSchema[]>;
    onClose: () => void;
    onInserted: (count: number) => void;
};

type ColConfig = {
    col: ColumnInfo;
    include: boolean;
    gen: string;
    params: GenParams;
    /** chance of NULL for nullable columns */
    nullPct: number;
};

const PREVIEW_ROWS = 12;
const MAX_ROWS = 100000;
/** keep each INSERT well under mysql 5.7's 4MB max_allowed_packet */
const CHUNK_BYTES = 512 * 1024;
const CHUNK_ROWS = 1000;
const UNIQUE_RETRIES = 50;

const lookupKey = (p: GenParams) => `${p.table}.${p.column}`;

const literal = (v: any) =>
    v === null || v === undefined ? 'NULL' : typeof v === 'number' ? `${v}` : str(`${v}`);

/**
 * Generate rows for the included columns.
 * Primary keys / unique columns are kept unique within the batch (composite keys as a tuple).
 */
function generate(configs: ColConfig[], count: number, lookups: Map<string, any[]>): any[][] {
    const active = configs.filter((c) => c.include && c.gen !== 'skip');
    const pkIdx = active.map((c, i) => (c.col.primaryKey ? i : -1)).filter((i) => i >= 0);
    const groups: number[][] = [
        ...(pkIdx.length ? [pkIdx] : []),
        ...active
            .map((c, i) => (c.col.unique && !c.col.primaryKey ? [i] : null))
            .filter(Boolean),
    ];
    const seen = groups.map(() => new Set<string>());
    const value = (c: ColConfig, index: number) => {
        if (c.col.nullable && c.nullPct > 0 && Math.random() * 100 < c.nullPct) {
            return null;
        }
        const g = generator(c.gen);
        const raw = g.make(c.params, { index, col: c.col, lookup: lookups.get(lookupKey(c.params)) });
        return castValue(raw, c.col);
    };
    const rows: any[][] = [];
    for (let r = 0; r < count; r++) {
        const row = active.map((c) => value(c, r));
        groups.forEach((g, gi) => {
            let key = JSON.stringify(g.map((i) => row[i]));
            for (let attempt = 0; seen[gi].has(key) && attempt < UNIQUE_RETRIES; attempt++) {
                g.forEach((i) => {
                    row[i] = value(active[i], r);
                });
                key = JSON.stringify(g.map((i) => row[i]));
            }
            seen[gi].add(key);
        });
        rows.push(row);
    }
    return rows;
}

const chunk = (rows: any[][]) => {
    const out: any[][][] = [];
    let cur: any[][] = [];
    let bytes = 0;
    rows.forEach((row) => {
        const size = JSON.stringify(row).length + 8;
        if (cur.length && (bytes + size > CHUNK_BYTES || cur.length >= CHUNK_ROWS)) {
            out.push(cur);
            cur = [];
            bytes = 0;
        }
        cur.push(row);
        bytes += size;
    });
    if (cur.length) {
        out.push(cur);
    }
    return out;
};

export function SeedDialog(p: SeedDialogProps) {
    const [configs, setConfigs] = React.useState<ColConfig[]>([]);
    const [count, setCount] = React.useState('50');
    const [ignore, setIgnore] = React.useState(false);
    const [seed, setSeed] = React.useState(0);
    const [tab, setTab] = React.useState<'rows' | 'sql'>('rows');
    const [lookups, setLookups] = React.useState(new Map<string, any[]>());
    const [lookupColumns, setLookupColumns] = React.useState<Record<string, string[]>>({});
    const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
    const [error, setError] = React.useState('');
    const cancelled = React.useRef(false);

    // columns + real foreign keys => suggested generators
    React.useEffect(() => {
        Promise.all([
            p.getSchema(p.table),
            api.runQuery(
                p.conID,
                `SELECT COLUMN_NAME c, REFERENCED_TABLE_NAME t, REFERENCED_COLUMN_NAME r
                 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${str(p.table)}
                   AND REFERENCED_TABLE_NAME IS NOT NULL`
            ),
        ]).then(([schema, [fkRows]]) => {
            const fks = new Map<string, { table: string; column: string }>();
            (Array.isArray(fkRows) ? fkRows : []).forEach((r: any) =>
                fks.set(r.c, { table: r.t, column: r.r })
            );
            setConfigs(
                (schema || []).map((s) => {
                    const col = columnInfo(s);
                    const sug = suggest(col, fks.get(col.name), p.tables);
                    return {
                        col,
                        include: sug.gen !== 'skip',
                        gen: sug.gen,
                        params: sug.params,
                        nullPct: 0,
                    };
                })
            );
        });
    }, [p.table]);

    // load values for "existing value from table" generators
    const neededLookups = configs
        .filter((c) => c.include && c.gen === 'lookup' && c.params.table && c.params.column)
        .map((c) => c.params);
    const lookupSignature = neededLookups.map(lookupKey).join('|');
    React.useEffect(() => {
        neededLookups.forEach((lp) => {
            const key = lookupKey(lp);
            if (lookups.has(key)) {
                return;
            }
            api.runQuery(
                p.conID,
                `SELECT DISTINCT ${ident(lp.column)} v FROM ${ident(lp.table)} WHERE ${ident(
                    lp.column
                )} IS NOT NULL LIMIT 5000`
            ).then(([rows]) =>
                setLookups((m) =>
                    new Map(m).set(key, Array.isArray(rows) ? rows.map((r: any) => r.v) : [])
                )
            );
        });
    }, [lookupSignature]);

    const loadLookupColumns = (table: string) => {
        if (!table || lookupColumns[table]) {
            return;
        }
        p.getSchema(table).then((s) =>
            setLookupColumns((m) => ({ ...m, [table]: (s || []).map((c) => c.FieldName) }))
        );
    };
    React.useEffect(() => {
        configs.forEach((c) => c.gen === 'lookup' && c.params.table && loadLookupColumns(c.params.table));
    }, [configs]);

    const update = (i: number, patch: Partial<ColConfig>) =>
        setConfigs((all) => all.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    const setParams = (i: number, patch: GenParams) =>
        setConfigs((all) =>
            all.map((c, j) => (j === i ? { ...c, params: { ...c.params, ...patch } } : c))
        );

    const active = configs.filter((c) => c.include && c.gen !== 'skip');
    const rowCount = Math.min(MAX_ROWS, Math.max(0, parseInt(count, 10) || 0));

    const preview = React.useMemo(
        () => (active.length ? generate(configs, Math.min(PREVIEW_ROWS, rowCount || PREVIEW_ROWS), lookups) : []),
        [configs, lookups, seed, rowCount > 0]
    );
    const previewObjects = React.useMemo(
        () =>
            preview.map((row) =>
                Object.fromEntries(active.map((c, i) => [c.col.name, row[i]]))
            ),
        [preview]
    );

    const problems: string[] = [];
    if (!active.length) problems.push('Pick at least one column');
    if (!rowCount) problems.push('Enter how many rows to insert');
    configs.forEach((c) => {
        if (!c.include) {
            if (!c.col.nullable && !c.col.hasDefault && !c.col.autoIncrement && !c.col.generated) {
                problems.push(`${c.col.name} is NOT NULL without a default , it needs a value`);
            }
            return;
        }
        if (c.gen === 'lookup') {
            if (!c.params.table || !c.params.column) {
                problems.push(`${c.col.name}: pick the table and column to take values from`);
            } else if (lookups.get(lookupKey(c.params))?.length === 0) {
                problems.push(`${c.col.name}: ${c.params.table}.${c.params.column} has no values yet , seed it first`);
            }
        }
    });

    const sql = React.useMemo(() => {
        if (!active.length || !preview.length) {
            return '';
        }
        const cols = active.map((c) => ident(c.col.name)).join(', ');
        const shown = preview.slice(0, 3);
        const values = shown.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');
        const more = rowCount - shown.length;
        return `INSERT ${ignore ? 'IGNORE ' : ''}INTO ${ident(p.table)} (${cols})\nVALUES\n${values}${
            more > 0 ? `,\n  -- … ${more.toLocaleString()} more generated rows (sent as parameterized batches)` : ''
        };`;
    }, [preview, ignore, rowCount]);

    const insert = async () => {
        setError('');
        cancelled.current = false;
        const rows = generate(configs, rowCount, lookups);
        const columns = active.map((c) => c.col.name);
        const batches = chunk(rows);
        let done = 0;
        let affected = 0;
        setProgress({ done: 0, total: rows.length });
        for (const batch of batches) {
            if (cancelled.current) {
                break;
            }
            // eslint-disable-next-line no-await-in-loop
            const [n, err] = await api.insertRows(p.conID, p.table, columns, batch, ignore);
            if (err) {
                setProgress(null);
                setError(
                    `${err.message}${done ? ` (${done.toLocaleString()} rows were inserted before this)` : ''}`
                );
                if (done) {
                    p.onInserted(affected);
                }
                return;
            }
            done += batch.length;
            affected += n;
            setProgress({ done, total: rows.length });
        }
        setProgress(null);
        p.onInserted(affected);
        p.onClose();
    };

    const busy = !!progress;

    const renderParams = (c: ColConfig, i: number) => {
        const g = generator(c.gen);
        return (g.params || []).map((kind) => {
            switch (kind) {
                case 'range':
                    return (
                        <span key={kind} className="seed-range">
                            <input
                                className="app-input is-mono"
                                type="number"
                                value={c.params.min ?? ''}
                                placeholder="min"
                                onChange={(ev) => setParams(i, { min: ev.target.value === '' ? undefined : +ev.target.value })}
                            />
                            {c.gen !== 'sequence' && (
                                <input
                                    className="app-input is-mono"
                                    type="number"
                                    value={c.params.max ?? ''}
                                    placeholder="max"
                                    onChange={(ev) => setParams(i, { max: ev.target.value === '' ? undefined : +ev.target.value })}
                                />
                            )}
                        </span>
                    );
                case 'decimals':
                    return (
                        <input
                            key={kind}
                            className="app-input is-mono seed-small"
                            type="number"
                            min={0}
                            title="Decimal places"
                            value={c.params.decimals ?? 2}
                            onChange={(ev) => setParams(i, { decimals: +ev.target.value })}
                        />
                    );
                case 'length':
                    return (
                        <input
                            key={kind}
                            className="app-input is-mono seed-small"
                            type="number"
                            min={1}
                            title="Length"
                            value={c.params.length ?? 10}
                            onChange={(ev) => setParams(i, { length: +ev.target.value })}
                        />
                    );
                case 'choices':
                    return (
                        <input
                            key={kind}
                            className="app-input is-mono"
                            value={c.params.choices || ''}
                            placeholder="a, b, c"
                            onChange={(ev) => setParams(i, { choices: ev.target.value })}
                        />
                    );
                case 'value':
                    return (
                        <input
                            key={kind}
                            className="app-input is-mono"
                            value={c.params.value || ''}
                            placeholder="value"
                            onChange={(ev) => setParams(i, { value: ev.target.value })}
                        />
                    );
                case 'lookup':
                    return (
                        <span key={kind} className="seed-range">
                            <select
                                className="select"
                                value={c.params.table || ''}
                                onChange={(ev) => {
                                    loadLookupColumns(ev.target.value);
                                    setParams(i, { table: ev.target.value, column: '' });
                                }}
                            >
                                <option value="">table…</option>
                                {p.tables.map((t) => (
                                    <option key={t}>{t}</option>
                                ))}
                            </select>
                            <select
                                className="select"
                                value={c.params.column || ''}
                                disabled={!c.params.table}
                                onChange={(ev) => setParams(i, { column: ev.target.value })}
                            >
                                <option value="">column…</option>
                                {(lookupColumns[c.params.table] || []).map((col) => (
                                    <option key={col}>{col}</option>
                                ))}
                            </select>
                        </span>
                    );
                default:
                    return null;
            }
        });
    };

    return (
        <div className="backdrop is-flush">
            <div className="wizard" onMouseDown={(ev) => ev.stopPropagation()}>
                <div className="wizard-header">
                    <Sparkles size={16} />
                    <span className="wizard-title">Seed with fake data</span>
                    <Table2 size={13} />
                    <code className="mono">{p.table}</code>
                    <div className="toolbar-spacer" />
                    <label className="field-label" htmlFor="seed-count">
                        Rows
                    </label>
                    <input
                        id="seed-count"
                        className="app-input is-mono"
                        style={{ width: 90 }}
                        type="number"
                        min={1}
                        max={MAX_ROWS}
                        value={count}
                        onChange={(ev) => setCount(ev.target.value)}
                    />
                    <label className="checkbox" title="Skip rows that collide with existing unique keys">
                        <input type="checkbox" checked={ignore} onChange={(ev) => setIgnore(ev.target.checked)} />
                        Skip duplicates
                    </label>
                </div>

                <div className="wizard-body">
                    <div className="seed-cols">
                        <div className="seed-row ct-head">
                            <span />
                            <span>Column</span>
                            <span>Type</span>
                            <span>Generator</span>
                            <span>Options</span>
                            <span title="Chance of NULL">NULL %</span>
                            <span>Example</span>
                        </div>
                        {configs.map((c, i) => {
                            const activeIdx = active.indexOf(c);
                            const example = activeIdx >= 0 && preview[0] ? preview[0][activeIdx] : undefined;
                            return (
                                <div key={c.col.name} className={`seed-row ${c.include ? '' : 'is-off'}`}>
                                    <input
                                        type="checkbox"
                                        checked={c.include}
                                        onChange={(ev) => update(i, { include: ev.target.checked })}
                                    />
                                    <span className="seed-name mono" title={c.col.name}>
                                        {c.col.name}
                                        {c.col.primaryKey && <span className="seed-tag">PK</span>}
                                        {c.col.autoIncrement && <span className="seed-tag">AI</span>}
                                    </span>
                                    <span className="seed-type mono" title={c.col.type}>
                                        {c.col.type}
                                    </span>
                                    <select
                                        className="select"
                                        value={c.gen}
                                        disabled={!c.include}
                                        onChange={(ev) => {
                                            const gen = ev.target.value;
                                            const params =
                                                gen === 'choice' && c.col.enumValues.length
                                                    ? { choices: c.col.enumValues.join(', ') }
                                                    : gen === 'lookup'
                                                    ? { table: c.params.table, column: c.params.column }
                                                    : {};
                                            update(i, { gen, params });
                                        }}
                                    >
                                        {GENERATOR_GROUPS.map((g) => (
                                            <optgroup key={g} label={g}>
                                                {GENERATORS.filter((x) => x.group === g).map((x) => (
                                                    <option key={x.id} value={x.id}>
                                                        {x.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                    <span className="seed-params">{c.include && renderParams(c, i)}</span>
                                    <input
                                        className="app-input is-mono seed-small"
                                        type="number"
                                        min={0}
                                        max={100}
                                        disabled={!c.include || !c.col.nullable}
                                        value={c.col.nullable ? c.nullPct : ''}
                                        placeholder="—"
                                        onChange={(ev) => update(i, { nullPct: +ev.target.value })}
                                    />
                                    <span className="seed-example mono" title={example === undefined ? '' : `${example}`}>
                                        {!c.include || c.gen === 'skip'
                                            ? 'default'
                                            : example === null
                                            ? 'NULL'
                                            : `${example ?? ''}`}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="wizard-tabs">
                    <button type="button" className={`tab ${tab === 'rows' ? 'is-active' : ''}`} onClick={() => setTab('rows')}>
                        Preview
                    </button>
                    <button type="button" className={`tab ${tab === 'sql' ? 'is-active' : ''}`} onClick={() => setTab('sql')}>
                        SQL
                    </button>
                    <div className="tabbar-spacer" />
                    <button type="button" className="btn is-ghost" style={{ alignSelf: 'center', marginRight: 8 }} onClick={() => setSeed((s) => s + 1)}>
                        <RefreshCw size={13} /> Regenerate
                    </button>
                </div>
                <div className="results" style={{ height: 230 }}>
                    {tab === 'rows' ? (
                        <DataGrid
                            columns={active.map((c) => ({ key: c.col.name, typeLabel: c.col.type }))}
                            rows={previewObjects}
                            empty="Pick at least one column"
                        />
                    ) : (
                        <SqlEditor value={sql} readOnly />
                    )}
                </div>

                <div className="wizard-footer">
                    {progress ? (
                        <div className="seed-progress">
                            <div className="seed-bar">
                                <span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                            </div>
                            <span className="toolbar-text">
                                {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows
                            </span>
                        </div>
                    ) : error || problems.length ? (
                        <div className="wizard-problems">
                            <span className="wizard-problem">
                                <CircleAlert size={13} />
                                {error || problems[0]}
                            </span>
                        </div>
                    ) : null}
                    <div className="toolbar-spacer" />
                    <button
                        type="button"
                        className="btn is-ghost"
                        onClick={() => {
                            if (busy) {
                                cancelled.current = true;
                            } else {
                                p.onClose();
                            }
                        }}
                    >
                        {busy ? 'Stop' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className="btn is-primary"
                        disabled={busy || problems.length > 0}
                        onClick={insert}
                    >
                        <Sparkles size={13} /> Insert {rowCount.toLocaleString()} rows
                    </button>
                </div>
            </div>
        </div>
    );
}
