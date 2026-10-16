import React from 'react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    CircleAlert,
    Clock,
    KeyRound,
    Link2,
    ListTree,
    Plus,
    Settings2,
    Table2,
    Trash2,
    Rows3,
} from 'lucide-react';
import { api, ColSchema } from 'renderer/api';
import { SqlEditor } from '../SqlEditor/SqlEditor';
import { Splitter, usePersistentSize } from '../ui/Splitter';
import { ColumnPicker } from './ColumnPicker';
import { cloneDef } from './loadTable';
import {
    autoFkName,
    autoIndexName,
    buildAlterStatements,
    buildSQL,
    ColumnDef,
    DefaultMode,
    FK_ACTIONS,
    FkAction,
    ForeignKeyDef,
    IndexDef,
    IndexKind,
    newColumn,
    newTable,
    Tab,
    TableDef,
    timestampColumns,
    TYPES,
    typeInfo,
    uid,
    validate,
} from './model';

export type CreateTableWizardProps = {
    conID: string;
    tables: string[];
    getSchema: (table: string) => Promise<ColSchema[]>;
    onClose: () => void;
    /** created / altered , with the table's (possibly new) name */
    onCreated: (tableName: string) => void;
    /** edit an existing table instead of creating one */
    edit?: {
        original: TableDef;
        tab?: Tab;
        /** start with a new blank row on that tab */
        add?: 'column' | 'index' | 'foreignKey';
    };
};

const blankIndex = (): IndexDef => ({ id: uid(), kind: 'INDEX', name: '', columns: [] });
const blankFk = (): ForeignKeyDef => ({
    id: uid(),
    name: '',
    columns: [],
    refTable: '',
    refColumns: [],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
});

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'columns', label: 'Columns', icon: <Rows3 size={14} /> },
    { id: 'indexes', label: 'Indexes', icon: <ListTree size={14} /> },
    { id: 'foreignKeys', label: 'Foreign Keys', icon: <Link2 size={14} /> },
    { id: 'options', label: 'Options', icon: <Settings2 size={14} /> },
];

const TYPE_GROUPS = Array.from(new Set(TYPES.map((t) => t.group)));

const FALLBACK_ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'ARCHIVE', 'CSV'];
const FALLBACK_COLLATIONS: Record<string, string[]> = {
    utf8mb4: ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin'],
    utf8: ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'],
    latin1: ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'],
    ascii: ['ascii_general_ci', 'ascii_bin'],
    binary: ['binary'],
};

const DEFAULT_PARAMS: Record<string, string> = {
    VARCHAR: '255',
    VARBINARY: '255',
    DECIMAL: '10,2',
};

/**
 * Visual CREATE TABLE builder with a live sql preview and a review step
 */
export function CreateTableWizard(p: CreateTableWizardProps) {
    const editing = !!p.edit;
    const [def, setDef] = React.useState<TableDef>(() => {
        if (!p.edit) {
            return newTable();
        }
        const d = cloneDef(p.edit.original);
        if (p.edit.add === 'column') d.columns.push(newColumn());
        if (p.edit.add === 'index') d.indexes.push(blankIndex());
        if (p.edit.add === 'foreignKey') d.foreignKeys.push(blankFk());
        return d;
    });
    const [tab, setTab] = React.useState<Tab>(p.edit?.tab || 'columns');
    /** some statements of a multi statement change ran before one failed */
    const [partial, setPartial] = React.useState(false);
    const [reviewing, setReviewing] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [runError, setRunError] = React.useState('');
    const [showAll, setShowAll] = React.useState(false);
    const [previewH, setPreviewH] = usePersistentSize('sequel-fidl.wizard-preview-h', 190);
    const [engines, setEngines] = React.useState(FALLBACK_ENGINES);
    const [collations, setCollations] = React.useState(FALLBACK_COLLATIONS);
    const [refColumns, setRefColumns] = React.useState<Record<string, string[]>>({});

    // ask the server what it supports , keep the fallbacks if that fails
    React.useEffect(() => {
        api.runQuery(p.conID, 'SHOW ENGINES').then(([rows, err]) => {
            if (!err && Array.isArray(rows)) {
                const list = rows
                    .filter((r) => /^(yes|default)$/i.test(r.Support))
                    .map((r) => r.Engine);
                list.length && setEngines(list);
            }
        });
        api.runQuery(p.conID, 'SHOW COLLATION').then(([rows, err]) => {
            if (!err && Array.isArray(rows) && rows.length) {
                const map: Record<string, string[]> = {};
                rows.forEach((r) => {
                    (map[r.Charset] = map[r.Charset] || []).push(r.Collation);
                });
                Object.values(map).forEach((l) => l.sort());
                setCollations(map);
            }
        });
    }, [p.conID]);

    const statements = React.useMemo(
        () => (p.edit ? buildAlterStatements(p.edit.original, def) : [buildSQL(def)]),
        [def]
    );
    const sql = statements.length ? statements.join('\n\n') : '-- No changes yet';
    const problems = React.useMemo(() => {
        const list = validate(def, p.tables);
        if (editing && !statements.length) {
            list.push({ tab: 'columns', field: 'none', message: 'No changes yet' });
        }
        return list;
    }, [def, p.tables, statements]);
    const bad = (field: string) => problems.some((pr) => pr.field === field);
    const inv = (field: string) => (bad(field) ? 'is-invalid' : '');
    const dirty = editing
        ? statements.length > 0
        : def.name !== '' || def.columns.length > 1 || def.indexes.length > 0 || def.foreignKeys.length > 0;

    const set = (patch: Partial<TableDef>) => setDef((d) => ({ ...d, ...patch }));
    const setOptions = (patch: Partial<TableDef['options']>) =>
        setDef((d) => ({ ...d, options: { ...d.options, ...patch } }));

    const updateColumn = (id: number, patch: Partial<ColumnDef>) =>
        setDef((d) => ({
            ...d,
            columns: d.columns.map((c) => {
                if (c.id !== id) {
                    return c;
                }
                const next = { ...c, ...patch };
                if (patch.type && patch.type !== c.type) {
                    const t = typeInfo(patch.type);
                    next.param = DEFAULT_PARAMS[patch.type] || '';
                    next.unsigned = next.unsigned && !!t.numeric;
                    next.autoIncrement = next.autoIncrement && !!t.integer;
                    next.onUpdateNow = next.onUpdateNow && !!t.temporal;
                    if (t.noDefault && next.defaultMode === 'value') {
                        next.defaultMode = 'none';
                    }
                }
                if (patch.primaryKey) {
                    next.nullable = false;
                }
                if (patch.autoIncrement) {
                    next.defaultMode = 'none';
                    if (!d.columns.some((x) => x.primaryKey)) {
                        next.primaryKey = true;
                        next.nullable = false;
                    }
                }
                return next;
            }),
        }));

    const removeColumn = (id: number) =>
        setDef((d) => ({
            ...d,
            columns: d.columns.filter((c) => c.id !== id),
            indexes: d.indexes.map((i) => ({ ...i, columns: i.columns.filter((x) => x !== id) })),
            foreignKeys: d.foreignKeys.map((f) => ({
                ...f,
                columns: f.columns.filter((x) => x !== id),
            })),
        }));

    const moveColumn = (id: number, dir: -1 | 1) =>
        setDef((d) => {
            const cols = [...d.columns];
            const i = cols.findIndex((c) => c.id === id);
            const j = i + dir;
            if (j < 0 || j >= cols.length) {
                return d;
            }
            [cols[i], cols[j]] = [cols[j], cols[i]];
            return { ...d, columns: cols };
        });

    const addColumn = () => {
        const col = newColumn();
        set({ columns: [...def.columns, col] });
        window.setTimeout(() => document.getElementById(`col-name-${col.id}`)?.focus());
    };

    const updateIndex = (id: number, patch: Partial<IndexDef>) =>
        set({ indexes: def.indexes.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    const updateFk = (id: number, patch: Partial<ForeignKeyDef>) =>
        set({ foreignKeys: def.foreignKeys.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

    // columns of the referenced tables , the table being built can reference itself
    const loadRefColumns = (table: string) => {
        if (!table || refColumns[table] || table === def.name) {
            return;
        }
        p.getSchema(table).then((s: ColSchema[]) =>
            setRefColumns((r) => ({ ...r, [table]: (s || []).map((c) => c.FieldName) }))
        );
    };
    const refOptions = (table: string) =>
        table && table === def.name
            ? def.columns.filter((c) => c.name).map((c) => ({ value: c.name, label: c.name }))
            : (refColumns[table] || []).map((c) => ({ value: c, label: c }));

    const columnOptions = def.columns
        .filter((c) => c.name.trim())
        .map((c) => ({ value: c.id, label: c.name }));

    const cancel = () => {
        if (!dirty || window.confirm(editing ? 'Discard your changes?' : 'Discard this table?')) {
            p.onClose();
        }
    };

    React.useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape' && !document.querySelector('.suggest-widget.visible')) {
                ev.stopPropagation();
                reviewing ? setReviewing(false) : cancel();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    /** run the statements in order , stop at the first error */
    const create = async () => {
        setRunning(true);
        setRunError('');
        for (let i = 0; i < statements.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            const [, err] = await api.runQuery(p.conID, statements[i]);
            if (err) {
                setRunning(false);
                setPartial(i > 0);
                setRunError(
                    `${err.message || err}${
                        i > 0
                            ? `\n\nStatement ${i + 1} of ${statements.length} failed. The ${i} before it already ran and can't be rolled back (MySQL DDL isn't transactional) , close this editor and reopen it from the current structure.`
                            : ''
                    }`
                );
                return;
            }
        }
        setRunning(false);
        p.onCreated(def.name.trim());
    };

    const tabProblems = (t: Tab) => problems.filter((pr) => pr.tab === t).length;
    const pk = def.columns.filter((c) => c.primaryKey);

    const renderColumns = () => (
        <>
            <div className="ct-cols">
                <div className="ct-row ct-head">
                    <span />
                    <span>Name</span>
                    <span>Type</span>
                    <span>Length / Values</span>
                    <span title="Unsigned">Unsig.</span>
                    <span title="Allow NULL">Null</span>
                    <span title="Primary key">PK</span>
                    <span title="Auto increment">A_I</span>
                    <span>Default</span>
                    <span title="ON UPDATE CURRENT_TIMESTAMP">On upd.</span>
                    <span>Comment</span>
                    <span />
                </div>
                {def.columns.map((c, i) => {
                    const t = typeInfo(c.type);
                    return (
                        <fieldset
                            key={c.id}
                            className="ct-row"
                            disabled={c.locked}
                            title={c.locked ? 'Generated column , change it with SQL in the Query tab' : undefined}
                        >
                            <span className="ct-num">
                                {editing && !c.origName ? <span className="ct-new" title="New column">+</span> : i + 1}
                            </span>
                            <input
                                id={`col-name-${c.id}`}
                                className={`input is-mono ${inv(`col:${c.id}:name`)}`}
                                value={c.name}
                                placeholder="column_name"
                                onChange={(ev) => updateColumn(c.id, { name: ev.target.value })}
                            />
                            <select
                                className="select"
                                value={c.type}
                                onChange={(ev) => updateColumn(c.id, { type: ev.target.value })}
                            >
                                {TYPE_GROUPS.map((g) => (
                                    <optgroup key={g} label={g}>
                                        {TYPES.filter((x) => x.group === g).map((x) => (
                                            <option key={x.name} value={x.name}>
                                                {x.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <input
                                className={`input is-mono ${inv(`col:${c.id}:param`)}`}
                                value={c.param}
                                disabled={t.param === 'none'}
                                placeholder={t.placeholder || ''}
                                onChange={(ev) => updateColumn(c.id, { param: ev.target.value })}
                            />
                            <input
                                type="checkbox"
                                checked={c.unsigned}
                                disabled={!t.numeric}
                                onChange={(ev) => updateColumn(c.id, { unsigned: ev.target.checked })}
                            />
                            <input
                                type="checkbox"
                                checked={c.nullable && !c.primaryKey}
                                disabled={c.primaryKey}
                                onChange={(ev) => updateColumn(c.id, { nullable: ev.target.checked })}
                            />
                            <input
                                type="checkbox"
                                className={inv(`col:${c.id}:pk`)}
                                checked={c.primaryKey}
                                onChange={(ev) => updateColumn(c.id, { primaryKey: ev.target.checked })}
                            />
                            <input
                                type="checkbox"
                                className={inv(`col:${c.id}:ai`)}
                                checked={c.autoIncrement}
                                disabled={!t.integer && !c.autoIncrement}
                                onChange={(ev) =>
                                    updateColumn(c.id, { autoIncrement: ev.target.checked })
                                }
                            />
                            <div className="ct-default">
                                <select
                                    className={`select ${inv(`col:${c.id}:default`)}`}
                                    value={c.defaultMode}
                                    disabled={c.autoIncrement}
                                    onChange={(ev) =>
                                        updateColumn(c.id, {
                                            defaultMode: ev.target.value as DefaultMode,
                                            defaultValue:
                                                ev.target.value === 'expression' && t.temporal
                                                    ? 'CURRENT_TIMESTAMP'
                                                    : c.defaultValue,
                                        })
                                    }
                                >
                                    <option value="none">None</option>
                                    <option value="null">NULL</option>
                                    <option value="value" disabled={t.noDefault}>
                                        Value
                                    </option>
                                    <option value="expression">Expression</option>
                                </select>
                                {(c.defaultMode === 'value' || c.defaultMode === 'expression') && (
                                    <input
                                        className={`input is-mono ${inv(`col:${c.id}:default`)}`}
                                        value={c.defaultValue}
                                        list={c.defaultMode === 'expression' ? 'ct-exprs' : undefined}
                                        placeholder={c.defaultMode === 'value' ? 'text' : 'CURRENT_TIMESTAMP'}
                                        onChange={(ev) =>
                                            updateColumn(c.id, { defaultValue: ev.target.value })
                                        }
                                    />
                                )}
                            </div>
                            <input
                                type="checkbox"
                                checked={c.onUpdateNow}
                                disabled={!t.temporal}
                                onChange={(ev) => updateColumn(c.id, { onUpdateNow: ev.target.checked })}
                            />
                            <input
                                className="app-input"
                                value={c.comment}
                                placeholder="—"
                                onChange={(ev) => updateColumn(c.id, { comment: ev.target.value })}
                            />
                            <span className="ct-actions">
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Move up"
                                    disabled={i === 0}
                                    onClick={() => moveColumn(c.id, -1)}
                                >
                                    <ArrowUp size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Move down"
                                    disabled={i === def.columns.length - 1}
                                    onClick={() => moveColumn(c.id, 1)}
                                >
                                    <ArrowDown size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-btn is-small ct-delete"
                                    title="Remove column"
                                    onClick={() => removeColumn(c.id)}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </span>
                        </fieldset>
                    );
                })}
            </div>
            <datalist id="ct-exprs">
                <option value="CURRENT_TIMESTAMP" />
                <option value="CURRENT_TIMESTAMP(3)" />
                <option value="(UUID())" />
                <option value="0" />
            </datalist>
            <div className="ct-add">
                <button type="button" className="btn" onClick={addColumn}>
                    <Plus size={13} /> Add Column
                </button>
                <button
                    type="button"
                    className="btn is-ghost"
                    disabled={def.columns.some((c) => c.name === 'created_at')}
                    onClick={() => set({ columns: [...def.columns, ...timestampColumns()] })}
                >
                    <Clock size={13} /> Add created_at / updated_at
                </button>
            </div>
        </>
    );

    const renderIndexes = () => (
        <>
            <div className="ct-card">
                <div className="ct-card-title">
                    <KeyRound size={13} /> Primary key
                </div>
                {pk.length ? (
                    <div className="chips">
                        {pk.map((c, i) => (
                            <span key={c.id} className="chip">
                                {pk.length > 1 && <span className="chip-order">{i + 1}</span>}
                                {c.name || '?'}
                            </span>
                        ))}
                        {pk.length > 1 && <span className="ct-hint">composite , in column order</span>}
                    </div>
                ) : (
                    <span className="ct-hint">None. Tick PK on columns , several ticks make a composite key.</span>
                )}
            </div>
            {def.indexes.map((idx) => (
                <div key={idx.id} className="ct-card ct-line">
                    <select
                        className="select"
                        value={idx.kind}
                        disabled={idx.locked}
                        title={idx.locked ? 'Functional index , it can be dropped but not edited here' : undefined}
                        onChange={(ev) => updateIndex(idx.id, { kind: ev.target.value as IndexKind })}
                    >
                        <option value="INDEX">INDEX</option>
                        <option value="UNIQUE">UNIQUE</option>
                        <option value="FULLTEXT">FULLTEXT</option>
                        <option value="SPATIAL">SPATIAL</option>
                    </select>
                    <input
                        className={`input is-mono ${inv(`idx:${idx.id}:name`)}`}
                        style={{ width: 200 }}
                        value={idx.name}
                        placeholder={autoIndexName(def, idx)}
                        onChange={(ev) => updateIndex(idx.id, { name: ev.target.value })}
                    />
                    <ColumnPicker
                        options={columnOptions}
                        value={idx.columns}
                        invalid={bad(`idx:${idx.id}:columns`)}
                        disabled={idx.locked}
                        lengths={idx.lengths as Record<string, number>}
                        lengthFor={(id) => {
                            const col = def.columns.find((c) => c.id === id);
                            return (
                                !!col &&
                                (idx.kind === 'INDEX' || idx.kind === 'UNIQUE') &&
                                (!!typeInfo(col.type).textual || /BLOB|BINARY/.test(col.type))
                            );
                        }}
                        onLengths={(lengths) => updateIndex(idx.id, { lengths })}
                        onChange={(columns) => updateIndex(idx.id, { columns })}
                    />
                    <button
                        type="button"
                        className="icon-btn is-small ct-delete"
                        title="Remove index"
                        onClick={() => set({ indexes: def.indexes.filter((x) => x.id !== idx.id) })}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
            <div className="ct-add">
                <button
                    type="button"
                    className="btn"
                    onClick={() =>
                        set({
                            indexes: [...def.indexes, { id: uid(), kind: 'INDEX', name: '', columns: [] }],
                        })
                    }
                >
                    <Plus size={13} /> Add Index
                </button>
            </div>
        </>
    );

    const renderForeignKeys = () => (
        <>
            {!def.foreignKeys.length && (
                <div className="ct-hint" style={{ padding: '4px 2px 10px' }}>
                    No foreign keys. Link columns of this table to another table's key.
                </div>
            )}
            {def.foreignKeys.map((fk) => (
                <div key={fk.id} className="ct-card">
                    <div className="ct-line">
                        <input
                            className="app-input is-mono"
                            style={{ width: 260 }}
                            value={fk.name}
                            placeholder={autoFkName(def, fk)}
                            onChange={(ev) => updateFk(fk.id, { name: ev.target.value })}
                        />
                        <div className="toolbar-spacer" />
                        <button
                            type="button"
                            className="icon-btn is-small ct-delete"
                            title="Remove foreign key"
                            onClick={() =>
                                set({ foreignKeys: def.foreignKeys.filter((x) => x.id !== fk.id) })
                            }
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                    <div className="ct-fk">
                        <span className="field-label">Columns</span>
                        <ColumnPicker
                            options={columnOptions}
                            value={fk.columns}
                            invalid={bad(`fk:${fk.id}:columns`)}
                            onChange={(columns) => updateFk(fk.id, { columns })}
                        />
                        <span className="field-label">References</span>
                        <div className="ct-line">
                            <select
                                className={`select ${inv(`fk:${fk.id}:ref`)}`}
                                value={fk.refTable}
                                onChange={(ev) => {
                                    loadRefColumns(ev.target.value);
                                    updateFk(fk.id, { refTable: ev.target.value, refColumns: [] });
                                }}
                            >
                                <option value="">Table…</option>
                                {def.name.trim() && (
                                    <option value={def.name.trim()}>{def.name.trim()} (this table)</option>
                                )}
                                {p.tables.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                            <ColumnPicker
                                options={refOptions(fk.refTable)}
                                value={fk.refColumns}
                                invalid={bad(`fk:${fk.id}:refColumns`)}
                                placeholder={fk.refTable ? '+ referenced column' : 'pick a table first'}
                                onChange={(refCols) => updateFk(fk.id, { refColumns: refCols })}
                            />
                        </div>
                        <span className="field-label">On delete</span>
                        <div className="ct-line">
                            <select
                                className="select"
                                value={fk.onDelete}
                                onChange={(ev) => updateFk(fk.id, { onDelete: ev.target.value as FkAction })}
                            >
                                {FK_ACTIONS.map((a) => (
                                    <option key={a}>{a}</option>
                                ))}
                            </select>
                            <span className="field-label" style={{ marginLeft: 12 }}>
                                On update
                            </span>
                            <select
                                className="select"
                                value={fk.onUpdate}
                                onChange={(ev) => updateFk(fk.id, { onUpdate: ev.target.value as FkAction })}
                            >
                                {FK_ACTIONS.map((a) => (
                                    <option key={a}>{a}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            ))}
            <div className="ct-add">
                <button
                    type="button"
                    className="btn"
                    onClick={() =>
                        set({
                            foreignKeys: [
                                ...def.foreignKeys,
                                {
                                    id: uid(),
                                    name: '',
                                    columns: [],
                                    refTable: '',
                                    refColumns: [],
                                    onDelete: 'RESTRICT',
                                    onUpdate: 'RESTRICT',
                                },
                            ],
                        })
                    }
                >
                    <Plus size={13} /> Add Foreign Key
                </button>
            </div>
        </>
    );

    const charsetCollations = collations[def.options.charset] || [];
    const renderOptions = () => (
        <div className="ct-form">
            <span className="field-label">Engine</span>
            <select
                className={`select ${inv('opt:engine')}`}
                value={def.options.engine}
                onChange={(ev) => setOptions({ engine: ev.target.value })}
            >
                {!engines.includes(def.options.engine) && <option>{def.options.engine}</option>}
                {engines.map((e) => (
                    <option key={e}>{e}</option>
                ))}
            </select>
            <span className="field-label">Character set</span>
            <select
                className="select"
                value={def.options.charset}
                onChange={(ev) => setOptions({ charset: ev.target.value, collation: '' })}
            >
                <option value="">Server default</option>
                {Object.keys(collations)
                    .sort()
                    .map((cs) => (
                        <option key={cs}>{cs}</option>
                    ))}
            </select>
            <span className="field-label">Collation</span>
            <select
                className="select"
                value={def.options.collation}
                disabled={!def.options.charset}
                onChange={(ev) => setOptions({ collation: ev.target.value })}
            >
                <option value="">Charset default</option>
                {charsetCollations.map((c) => (
                    <option key={c}>{c}</option>
                ))}
            </select>
            <span className="field-label">AUTO_INCREMENT start</span>
            <input
                className={`app-input is-mono ${inv('opt:ai')}`}
                value={def.options.autoIncrementStart}
                placeholder={editing ? 'unchanged' : '1'}
                onChange={(ev) => setOptions({ autoIncrementStart: ev.target.value })}
            />
            <span className="field-label">Comment</span>
            <input
                className="app-input"
                value={def.options.comment}
                placeholder="What this table is for"
                onChange={(ev) => setOptions({ comment: ev.target.value })}
            />
        </div>
    );

    return (
        <div className="backdrop is-flush">
            <div className="wizard" onMouseDown={(ev) => ev.stopPropagation()}>
                <div className="wizard-header">
                    <Table2 size={16} />
                    <span className="wizard-title">
                        {editing
                            ? reviewing
                                ? 'Review & Apply'
                                : 'Edit Structure'
                            : reviewing
                            ? 'Review & Create'
                            : 'New Table'}
                    </span>
                    {!reviewing && (
                        <input
                            className={`app-input is-mono wizard-name ${inv('table:name')}`}
                            autoFocus={!editing}
                            placeholder="table_name"
                            value={def.name}
                            onChange={(ev) => set({ name: ev.target.value })}
                        />
                    )}
                </div>

                {reviewing ? (
                    <div className="wizard-review">
                        <div className="ct-hint">
                            {editing ? (
                                <>
                                    {statements.length === 1
                                        ? 'This statement'
                                        : `These ${statements.length} statements`}{' '}
                                    will run on <strong>{p.edit.original.origName}</strong>
                                    {statements.length > 1 ? ' in order' : ''}. Nothing changes until
                                    you confirm. Large tables can take a while to rebuild.
                                </>
                            ) : (
                                <>
                                    This exact statement will run on <strong>{def.name}</strong>.
                                    Nothing is created until you confirm.
                                </>
                            )}
                        </div>
                        {runError && (
                            <div className="error-box">
                                <CircleAlert size={15} />
                                {runError}
                            </div>
                        )}
                        <div className="wizard-sql">
                            <SqlEditor value={sql} readOnly />
                        </div>
                    </div>
                ) : (
                    <>
                        <nav className="wizard-tabs">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`tab ${tab === t.id ? 'is-active' : ''}`}
                                    onClick={() => setTab(t.id)}
                                >
                                    {t.icon}
                                    {t.label}
                                    {t.id === 'indexes' && def.indexes.length > 0 && (
                                        <span className="tab-count">{def.indexes.length}</span>
                                    )}
                                    {t.id === 'foreignKeys' && def.foreignKeys.length > 0 && (
                                        <span className="tab-count">{def.foreignKeys.length}</span>
                                    )}
                                    {tabProblems(t.id) > 0 && <span className="tab-problem" />}
                                </button>
                            ))}
                        </nav>
                        <div className="wizard-body">
                            {tab === 'columns' && renderColumns()}
                            {tab === 'indexes' && renderIndexes()}
                            {tab === 'foreignKeys' && renderForeignKeys()}
                            {tab === 'options' && renderOptions()}
                        </div>
                        <Splitter
                            direction="horizontal"
                            size={previewH}
                            min={70}
                            max={600}
                            reverse
                            onChange={setPreviewH}
                        />
                        <div className="results" style={{ height: previewH }}>
                            <div className="ddl-header">SQL Preview</div>
                            <SqlEditor value={sql} readOnly />
                        </div>
                    </>
                )}

                <div className="wizard-footer">
                    {!reviewing && problems.length > 0 && (
                        <div className="wizard-problems">
                            <button
                                type="button"
                                className="wizard-problem"
                                onClick={() => setTab(problems[0].tab)}
                            >
                                <CircleAlert size={13} />
                                {problems[0].message}
                            </button>
                            {problems.length > 1 && (
                                <button
                                    type="button"
                                    className="btn is-ghost"
                                    onClick={() => setShowAll((s) => !s)}
                                >
                                    {showAll ? 'hide' : `+${problems.length - 1} more`}
                                </button>
                            )}
                            {showAll && (
                                <div className="menu wizard-problem-list">
                                    {problems.map((pr, i) => (
                                        <button
                                            key={`${pr.field}-${i}`}
                                            type="button"
                                            className="menu-item"
                                            onClick={() => {
                                                setTab(pr.tab);
                                                setShowAll(false);
                                            }}
                                        >
                                            <CircleAlert size={13} />
                                            {pr.message}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="toolbar-spacer" />
                    {reviewing ? (
                        <>
                            <button
                                type="button"
                                className="btn is-ghost"
                                disabled={running}
                                onClick={() => {
                                    setReviewing(false);
                                    setRunError('');
                                }}
                            >
                                <ArrowLeft size={13} /> Back
                            </button>
                            <button
                                type="button"
                                className="btn is-primary"
                                autoFocus
                                disabled={running || partial}
                                onClick={create}
                            >
                                {editing
                                    ? running
                                        ? 'Applying…'
                                        : 'Apply Changes'
                                    : running
                                    ? 'Creating…'
                                    : 'Create Table'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="btn is-ghost" onClick={cancel}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn is-primary"
                                disabled={problems.length > 0}
                                onClick={() => setReviewing(true)}
                            >
                                Review SQL…
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
