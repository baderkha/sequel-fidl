import React from 'react';
import { useDatabaseDialect } from 'renderer/database/DialectContext';
import { useAtom } from 'jotai';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    CircleAlert,
    Braces,
    Download,
    RefreshCw,
    Sparkles,
    Table2,
    Plus,
    X,
} from 'lucide-react';
import type { ExportSourceSpec } from 'renderer/api';
import { ConID, TxStateAtom } from 'renderer/State';
import { api, ColSchema } from 'renderer/api';
import { DataGrid, GridCellEdit, GridColumn, GridSort } from 'renderer/Components/DataGrid/DataGrid';
import { cellToText } from 'renderer/Components/DataGrid/format';
import { usePersistentSize } from 'renderer/Components/ui/Splitter';
import { useToast } from 'renderer/Components/ui/Toasts';
import { ContextMenu, MenuEntry, useContextMenu } from 'renderer/Components/ui/ContextMenu';
import { AppliedFilters, FilterBar } from './FilterBar';
import { DocumentView } from './DocumentView';
import { RecordEditor } from './RecordEditor';
import { newRecordDraft, recordInsert, RecordDraft, RecordInsert } from './recordDraft';
import {
    AssignmentsEditor,
    BulkBar,
    ConfirmSQL,
    CopyFormat,
    deleteSQL,
    insertSQL,
    keyInfoFor,
    pick,
    rowsAs,
    updateSQL,
} from './RowActions';
import { Copy, Files, PenLine, Trash2 } from 'lucide-react';
import type { ColumnAssignment } from 'renderer/api';

export type ContentTabProps = {
    TableName: string;
    refreshStamp: number;
    getSchema: (table: string) => Promise<ColSchema[]>;
    onSeed?: () => void;
    /** export the table as filtered / sorted here , detail describes that */
    onExport?: (source: ExportSourceSpec, detail: string) => void;
    /** views are read only */
    isView?: boolean;
};

const PAGE_SIZES = [100, 250, 500, 1000];

export const schemaToColumns = (schema: ColSchema[]): GridColumn[] =>
    schema.map((c) => ({
        key: c.FieldName,
        typeLabel: c.Type,
        primaryKey: c.IsPrimaryKey,
        editable: !/\b(?:VIRTUAL|STORED) GENERATED\b/i.test(c.Extra || ''),
        numeric:
            c.JsFriendlyType === 'number' || /^(decimal|numeric)/i.test(c.Type),
    }));

const fmt = (n: number) => n.toLocaleString();

export const Content = (p: ContentTabProps) => {
    const dialect = useDatabaseDialect();
    const [conID] = useAtom(ConID);
    const [schema, setSchema] = React.useState<ColSchema[]>([]);
    const [rows, setRows] = React.useState<any[]>([]);
    const [total, setTotal] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = usePersistentSize('sequel-fidl.page-size', 250);
    const [sort, setSort] = React.useState<GridSort>(null);
    const [applied, setApplied] = React.useState<AppliedFilters | null>(null);
    const [reload, setReload] = React.useState(0);
    const [contentView, setContentView] = React.useState<'table' | 'json'>(() => {
        try {
            return localStorage.getItem('sequel-fidl.content-view') === 'json' ? 'json' : 'table';
        } catch (e) {
            return 'table';
        }
    });
    const notify = useToast();
    const [tx] = useAtom(TxStateAtom);
    const [selection, setSelection] = React.useState<Set<number>>(new Set());
    const [dialog, setDialog] = React.useState<{ kind: 'delete' | 'set' | 'duplicate'; rows: any[] } | null>(null);
    const [assignments, setAssignments] = React.useState<ColumnAssignment[]>([]);
    const [cellChange, setCellChange] = React.useState<GridCellEdit | null>(null);
    const [recordChange, setRecordChange] = React.useState<Record<string, any> | null>(null);
    const [draft, setDraft] = React.useState<RecordDraft | null>(null);
    const [insertReview, setInsertReview] = React.useState<RecordInsert | null>(null);
    const [draftError, setDraftError] = React.useState('');
    const copyMenu = useContextMenu();
    const requestId = React.useRef(0);

    React.useEffect(() => {
        if (insertReview) document.querySelector<HTMLButtonElement>('.backdrop .modal-footer button[type="submit"]')?.focus();
        else document.querySelector<HTMLTextAreaElement>('.grid-draft-row textarea:not(:disabled)')?.focus();
    }, [insertReview]);

    React.useEffect(() => {
        setCellChange(null);
        setRecordChange(null);
        setDialog(null);
        setDraft(null);
        setInsertReview(null);
        setDraftError('');
    }, [conID, p.TableName]);

    React.useEffect(() => {
        try {
            localStorage.setItem('sequel-fidl.content-view', contentView);
        } catch (e) {}
        setSelection(new Set());
    }, [contentView]);

    // new table => fresh view state
    React.useEffect(() => {
        setPage(0);
        setSort(null);
        setApplied(null);
        setRows([]);
        setTotal(null);
        setSchema([]);
    }, [p.TableName]);

    React.useEffect(() => {
        if (!p.TableName) {
            return undefined;
        }
        let live = true;
        p.getSchema(p.TableName).then((s) => {
            if (live) {
                setSchema(s || []);
            }
        });
        return () => {
            live = false;
        };
    }, [p.TableName, p.getSchema]);

    const filters = applied ? applied.filters : [];
    const filterMode = applied ? applied.mode : 'AND';

    React.useEffect(() => {
        if (!conID || !p.TableName) {
            return;
        }
        const id = ++requestId.current;
        setLoading(true);
        api.selectRows(conID, {
            tableName: p.TableName,
            limit: pageSize,
            offset: page * pageSize,
            orderByCol: sort ? sort.key : '',
            orderDir: sort ? sort.dir : undefined,
            extraFilters: filters,
            filterMode,
        }).then(([data, err]) => {
            if (id !== requestId.current) {
                return;
            }
            setLoading(false);
            setError(err ? err.message : '');
            setRows(err ? [] : data || []);
        });
    }, [conID, p.TableName, page, pageSize, sort, applied, p.refreshStamp, reload]);

    React.useEffect(() => {
        if (!conID || !p.TableName) {
            return undefined;
        }
        let live = true;
        api.countRows(conID, p.TableName, filters, filterMode).then(([count, err]) => {
            if (live) {
                setTotal(err ? null : count);
            }
        });
        return () => {
            live = false;
        };
    }, [conID, p.TableName, applied, p.refreshStamp, reload]);

    const columns = React.useMemo<GridColumn[]>(() => {
        if (schema.length) {
            return schemaToColumns(schema);
        }
        return rows.length ? Object.keys(rows[0]).map((key) => ({ key })) : [];
    }, [schema, rows]);

    // ---- bulk row operations
    const keyInfo = React.useMemo(() => keyInfoFor(schema), [schema]);
    const colNames = columns.map((c) => c.key);
    const rowsOf = (sel: Set<number>) =>
        Array.from(sel)
            .sort((a, b) => a - b)
            .map((i) => rows[i])
            .filter(Boolean);
    const keysOf = (rs: any[]) => rs.map((r) => pick(r, keyInfo.cols));
    const noKeyWarning = keyInfo.byAll
        ? "This table has no primary or unique key , each row is matched on all of its values (one at a time). Identical duplicate rows can't be told apart."
        : undefined;
    const done = (msg: string) => {
        notify(msg, 'success');
        setDialog(null);
        setCellChange(null);
        setRecordChange(null);
        setDraft(null);
        setInsertReview(null);
        setDraftError('');
        setSelection(new Set());
        setReload((r) => r + 1);
    };
    const openDialog = (kind: 'delete' | 'set' | 'duplicate', sel: Set<number> = selection) => {
        const rs = rowsOf(sel);
        if (!rs.length) {
            return;
        }
        if (kind === 'set') {
            setAssignments([{ column: colNames.find((c) => !keyInfo.cols.includes(c) || keyInfo.byAll) || colNames[0], mode: 'value', value: '' }]);
        }
        setDialog({ kind, rows: rs });
    };
    const copyAs = (format: CopyFormat, sel: Set<number> = selection) => {
        const rs = rowsOf(sel);
        navigator.clipboard
            .writeText(rowsAs(format, p.TableName, colNames, rs, dialect, schema))
            .then(() => notify(`Copied ${rs.length} row${rs.length === 1 ? '' : 's'} as ${format.toUpperCase()}`, 'success'));
    };
    const copyEntries = (sel?: Set<number>): MenuEntry[] =>
        (['sql', 'csv', 'tsv', 'json'] as CopyFormat[]).map((f) => ({
            label: f === 'sql' ? 'Copy as SQL INSERT' : f === 'tsv' ? 'Copy as TSV (spreadsheet)' : `Copy as ${f.toUpperCase()}`,
            icon: <Copy size={14} />,
            onSelect: () => copyAs(f, sel),
        }));
    const selectionMenu = (sel: Set<number>): MenuEntry[] => [
        { label: `Set Value on ${sel.size} Row${sel.size === 1 ? '' : 's'}…`, icon: <PenLine size={14} />, onSelect: () => openDialog('set', sel) },
        { label: `Duplicate ${sel.size} Row${sel.size === 1 ? '' : 's'}`, icon: <Files size={14} />, onSelect: () => openDialog('duplicate', sel) },
        ...copyEntries(sel),
        'separator',
        { label: `Delete ${sel.size} Row${sel.size === 1 ? '' : 's'}…`, icon: <Trash2 size={14} />, danger: true, kbd: '⌫', onSelect: () => openDialog('delete', sel) },
    ];
    const autoCols = schema.filter((c) => c.AutoIncrement).map((c) => c.FieldName);
    const dupCols = colNames.filter((c) => !autoCols.includes(c));

    const pages = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : null;
    const first = rows.length ? page * pageSize + 1 : 0;
    const last = page * pageSize + rows.length;
    const canNext = pages !== null ? page + 1 < pages : rows.length === pageSize;
    const cancelInsert = () => {
        setDraft(null);
        setInsertReview(null);
        setDraftError('');
    };
    const reviewInsert = () => {
        if (!draft) return;
        try { setInsertReview(recordInsert(schema, draft)); setDraftError(''); }
        catch (err) { setDraftError((err as Error).message); }
    };

    return (
        <div className="view">
            <div className="content-head">
                <FilterBar
                    columns={columns}
                    applied={applied}
                    onApply={(a) => {
                        setApplied(a);
                        setPage(0);
                    }}
                />
                <div className="content-head-actions">
                    <div className="content-view-toggle" role="group" aria-label="Content view">
                        <button type="button" aria-pressed={contentView === 'table'} onClick={() => setContentView('table')}><Table2 size={13} /> Table</button>
                        <button type="button" aria-pressed={contentView === 'json'} disabled={!!draft} onClick={() => setContentView('json')}><Braces size={13} /> JSON</button>
                    </div>
                    {tx.open && (
                        <span className="tx-pill" title="Rows include changes not committed yet , only this window sees them">
                            <span className="tx-dot" /> In transaction
                        </span>
                    )}
                    {!p.isView && <button type="button" className="btn" disabled={!conID || !p.TableName || !schema.length || loading || !!error || !!draft || !!cellChange || !!dialog || !!recordChange}
                        onClick={() => {
                            setContentView('table');
                            setSelection(new Set());
                            setDraftError('');
                            setDraft(newRecordDraft(schema));
                        }}><Plus size={13} /> Insert Record</button>}
                {p.onSeed && (
                    <button
                        type="button"
                        className="btn is-ghost"
                        title="Insert generated rows"
                        onClick={p.onSeed}
                    >
                        <Sparkles size={13} /> Seed
                    </button>
                )}
                <button
                    type="button"
                    className="icon-btn"
                    title="Reload rows"
                    onClick={() => setReload((r) => r + 1)}
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
                </div>
            </div>
            {draft && <div className="record-insert-bar">
                <span className="toolbar-text">New record · Unfilled defaults and IDs are generated automatically.</span>
                <div className="toolbar-spacer" />
                <button type="button" className="btn is-ghost" disabled={!!insertReview} onClick={cancelInsert}><X size={13} /> Cancel record</button>
                <button type="button" className="btn is-primary" disabled={!!insertReview} onClick={reviewInsert}>Review insert…</button>
            </div>}
            {draftError && <div className="error-box" role="alert"><CircleAlert size={15} />{draftError}</div>}
            {error ? (
                <div className="result-message is-error">
                    <div className="error-box">
                        <CircleAlert size={15} />
                        {error}
                    </div>
                </div>
            ) : (
                <div className="content-body">
                    {contentView === 'json' ? (
                        <DocumentView
                            key={`${conID}:${p.TableName}:${page}`}
                            rows={rows}
                            schema={schema}
                            rowOffset={page * pageSize}
                            loading={loading}
                            empty={applied ? 'No rows match the filter' : 'This table is empty'}
                            sort={sort}
                            onSortChange={(s) => { setSort(s); setPage(0); }}
                            onEdit={!p.isView && schema.length ? (row) => setRecordChange({ ...row }) : undefined}
                            onDelete={!p.isView && schema.length ? (index) => openDialog('delete', new Set([index])) : undefined}
                        />
                    ) : <DataGrid
                        columns={columns}
                        rows={rows}
                        draft={draft ? {
                            cells: draft,
                            disabled: !!insertReview,
                            onChange: (column, cell) => {
                                setDraft((current) => current ? { ...current, [column]: cell } : current);
                                setDraftError('');
                            },
                            onCancel: cancelInsert,
                            onReview: reviewInsert,
                        } : undefined}
                        loading={loading}
                        sort={sort}
                        manualSort
                        onSortChange={(s) => {
                            setSort(s);
                            setPage(0);
                        }}
                        rowOffset={page * pageSize}
                        storageKey={`content:${p.TableName}`}
                        empty={applied ? 'No rows match the filter' : 'This table is empty'}
                        selection={p.isView || draft ? undefined : selection}
                        onSelectionChange={p.isView || draft ? undefined : setSelection}
                        onDeleteRequest={(sel) => openDialog('delete', sel)}
                        selectionMenu={selectionMenu}
                        onCellEdit={!p.isView && !draft && schema.length && !cellChange && !dialog
                            ? (edit) => setCellChange({ ...edit, row: { ...edit.row } })
                            : undefined}
                    />}
                    {contentView === 'table' && selection.size > 0 && (
                        <BulkBar
                            count={selection.size}
                            onSetValue={() => openDialog('set')}
                            onDuplicate={() => openDialog('duplicate')}
                            onCopy={(ev) => copyMenu.open(ev, copyEntries())}
                            onDelete={() => openDialog('delete')}
                            onClear={() => setSelection(new Set())}
                        />
                    )}
                </div>
            )}
            <div className="app-toolbar is-bottom">
                <span className="toolbar-text">
                    {total === null
                        ? rows.length
                            ? `Rows ${fmt(first)}–${fmt(last)}`
                            : ''
                        : total === 0
                        ? '0 rows'
                        : `Rows ${fmt(first)}–${fmt(last)} of ${fmt(total)}${
                              applied
                                  ? ` (${applied.filters.length} filter${applied.filters.length === 1 ? '' : 's'})`
                                  : ''
                          }`}
                </span>
                {sort && (
                    <span className="toolbar-text">
                        · sorted by <strong>{sort.key}</strong>{' '}
                        {sort.dir === 'ASC' ? '↑' : '↓'}
                    </span>
                )}
                <div className="toolbar-spacer" />
                {p.onExport && (
                    <>
                        <button
                            type="button"
                            className="btn is-ghost"
                            title={applied ? 'Export the rows matching the filter' : 'Export the table'}
                            onClick={() =>
                                p.onExport(
                                    {
                                        kind: 'table',
                                        table: p.TableName,
                                        filters,
                                        filterMode,
                                        orderBy: sort ? sort.key : undefined,
                                        orderDir: sort ? sort.dir : undefined,
                                    },
                                    [
                                        applied && `${applied.filters.length} filter${applied.filters.length === 1 ? '' : 's'}`,
                                        sort && `sorted by ${sort.key} ${sort.dir === 'ASC' ? '↑' : '↓'}`,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')
                                )
                            }
                        >
                            <Download size={13} /> Export…
                        </button>
                        <div className="toolbar-sep" />
                    </>
                )}
                <select
                    className="select"
                    value={pageSize}
                    onChange={(ev) => {
                        setPageSize(+ev.target.value);
                        setPage(0);
                    }}
                    title="Rows per page"
                >
                    {PAGE_SIZES.map((s) => (
                        <option key={s} value={s}>
                            {s} / page
                        </option>
                    ))}
                </select>
                <div className="toolbar-sep" />
                <button
                    type="button"
                    className="icon-btn"
                    disabled={page === 0}
                    onClick={() => setPage(0)}
                    title="First page"
                >
                    <ChevronsLeft size={15} />
                </button>
                <button
                    type="button"
                    className="icon-btn"
                    disabled={page === 0}
                    onClick={() => setPage((pg) => pg - 1)}
                    title="Previous page"
                >
                    <ChevronLeft size={15} />
                </button>
                <span className="toolbar-text">
                    Page {fmt(page + 1)}
                    {pages !== null ? ` of ${fmt(pages)}` : ''}
                </span>
                <button
                    type="button"
                    className="icon-btn"
                    disabled={!canNext}
                    onClick={() => setPage((pg) => pg + 1)}
                    title="Next page"
                >
                    <ChevronRight size={15} />
                </button>
                <button
                    type="button"
                    className="icon-btn"
                    disabled={pages === null || page + 1 >= pages}
                    onClick={() => pages !== null && setPage(pages - 1)}
                    title="Last page"
                >
                    <ChevronsRight size={15} />
                </button>
            </div>
            <ContextMenu {...copyMenu} />
            {insertReview && <ConfirmSQL
                icon={<Plus size={16} />}
                title={`Insert record into ${p.TableName}?`}
                submitLabel="Insert record"
                sql={insertSQL(p.TableName, insertReview.columns, [Object.fromEntries(insertReview.columns.map((column, i) => [column, insertReview.values[i]]))], dialect)}
                onClose={() => setInsertReview(null)}
                onSubmit={async () => {
                    const [n, err] = await api.insertRows(conID, p.TableName, insertReview.columns, [insertReview.values], false);
                    if (err) return err.message;
                    // A completed INSERT can have an unavailable/zero count (for
                    // example an older backend or an INSTEAD OF trigger). Refresh
                    // the table rather than inviting a duplicate retry.
                    done(n > 0 ? 'Inserted record' : 'Insert completed; table refreshed');
                    return null;
                }}
            />}
            {recordChange && (
                <RecordEditor
                    row={recordChange}
                    table={p.TableName}
                    schema={schema}
                    keyInfo={keyInfo}
                    warning={noKeyWarning}
                    onClose={() => setRecordChange(null)}
                    onSave={async (set) => {
                        const [n, err] = await api.updateRows(conID, p.TableName, set, keysOf([recordChange]), keyInfo.byAll);
                        if (err) return err.message;
                        if (!n) return 'No matching row was updated. Reload the table and try again.';
                        done('Updated record');
                        return null;
                    }}
                />
            )}
            {cellChange && (
                <ConfirmSQL
                    icon={<PenLine size={16} />}
                    title={<>Update <code>{cellChange.column.key}</code> in <code>{p.TableName}</code>?</>}
                    submitLabel="Update row"
                    warning={noKeyWarning}
                    sql={updateSQL(p.TableName, [{ column: cellChange.column.key, mode: 'value', value: cellChange.value }], keysOf([cellChange.row]), keyInfo, dialect)}
                    onClose={() => setCellChange(null)}
                    onSubmit={async () => {
                        const [n, err] = await api.updateRows(
                            conID,
                            p.TableName,
                            [{ column: cellChange.column.key, mode: 'value', value: cellChange.value }],
                            keysOf([cellChange.row]),
                            keyInfo.byAll
                        );
                        if (err) return err.message;
                        if (!n) return 'No matching row was updated. Reload the table and try again.';
                        done(`Updated ${cellChange.column.key}`);
                        return null;
                    }}
                >
                    <p className="toolbar-text">Only this cell in one row will change.</p>
                    <dl className="cell-change-comparison">
                        <div>
                            <dt>Before</dt>
                            <dd><pre>{cellChange.row[cellChange.column.key] === '' ? '(empty string)' : cellToText(cellChange.row[cellChange.column.key], cellChange.column.typeLabel)}</pre></dd>
                        </div>
                        <div>
                            <dt>After</dt>
                            <dd><pre>{cellChange.value === '' ? '(empty string)' : cellChange.value}</pre></dd>
                        </div>
                    </dl>
                </ConfirmSQL>
            )}
            {dialog?.kind === 'delete' && (
                <ConfirmSQL
                    icon={<Trash2 size={16} />}
                    title={`Delete ${dialog.rows.length.toLocaleString()} row${dialog.rows.length === 1 ? '' : 's'} from ${p.TableName}?`}
                    submitLabel="Delete"
                    danger
                    warning={noKeyWarning}
                    sql={deleteSQL(p.TableName, keysOf(dialog.rows), keyInfo, dialect)}
                    onClose={() => setDialog(null)}
                    onSubmit={async () => {
                        const [n, err] = await api.deleteRows(conID, p.TableName, keysOf(dialog.rows), keyInfo.byAll);
                        if (err) return err.message;
                        done(`Deleted ${n.toLocaleString()} row${n === 1 ? '' : 's'}`);
                        return null;
                    }}
                />
            )}
            {dialog?.kind === 'set' && (
                <ConfirmSQL
                    icon={<PenLine size={16} />}
                    title={`Set values on ${dialog.rows.length.toLocaleString()} row${dialog.rows.length === 1 ? '' : 's'}`}
                    submitLabel={`Update ${dialog.rows.length.toLocaleString()} row${dialog.rows.length === 1 ? '' : 's'}`}
                    warning={noKeyWarning}
                    disabled={assignments.some((a) => a.mode === 'expression' && !`${a.value || ''}`.trim())}
                    sql={updateSQL(p.TableName, assignments, keysOf(dialog.rows), keyInfo, dialect)}
                    onClose={() => setDialog(null)}
                    onSubmit={async () => {
                        const [n, err] = await api.updateRows(conID, p.TableName, assignments, keysOf(dialog.rows), keyInfo.byAll);
                        if (err) return err.message;
                        done(`Updated ${n.toLocaleString()} row${n === 1 ? '' : 's'}`);
                        return null;
                    }}
                >
                    <AssignmentsEditor columns={colNames} value={assignments} onChange={setAssignments} />
                </ConfirmSQL>
            )}
            {dialog?.kind === 'duplicate' && (
                <ConfirmSQL
                    icon={<Files size={16} />}
                    title={`Duplicate ${dialog.rows.length.toLocaleString()} row${dialog.rows.length === 1 ? '' : 's'}`}
                    submitLabel="Duplicate"
                    warning={
                        autoCols.length
                            ? undefined
                            : keyInfo.byAll
                            ? undefined
                            : 'This table has no generated identity column , the copies keep their key values and will fail on a duplicate key unless you change them first.'
                    }
                    sql={insertSQL(p.TableName, dupCols, dialog.rows, dialect, schema)}
                    onClose={() => setDialog(null)}
                    onSubmit={async () => {
                        const values = dialog.rows.map((r) => dupCols.map((c) => r[c]));
                        const [n, err] = await api.insertRows(conID, p.TableName, dupCols, values, false);
                        if (err) return err.message;
                        done(`Duplicated ${n.toLocaleString()} row${n === 1 ? '' : 's'}`);
                        return null;
                    }}
                />
            )}
        </div>
    );
};
