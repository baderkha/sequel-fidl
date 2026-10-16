import React from 'react';
import {
    Ban,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    Clock,
    Download,
    Eye,
    FolderOpen,
    Loader2,
    Search,
    SkipForward,
    Table2,
} from 'lucide-react';
import { api, BatchItemProgress, BatchProgress, ExistingFiles, ExportColumn, ExportRequest, onMainEvent, Table } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';
import { ColumnPicker } from './ColumnPicker';
import {
    describeChunk,
    ExportPreviewPane,
    ExportSettings,
    formatBytes,
    formatDuration,
    loadSetting,
    saveSetting,
    usePreview,
    useExportSettings,
} from './ExportSettings';

export type BatchExportDialogProps = {
    conID: string;
    tables: Table[];
    database: string;
    /** where the folder picker starts (project folder) */
    defaultDir: string | null;
    /** tables ticked when it opens */
    preselect?: string[];
    onClose: () => void;
};

type Step = 'tables' | 'format' | 'export';
const STEPS: Array<[Step, string]> = [
    ['tables', 'Tables'],
    ['format', 'Format'],
    ['export', 'Export'],
];

/** null : every column */
type Picks = Map<string, Set<string> | null>;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Export many tables in one go : pick tables (and their columns) → format / options → destination , then a
 * batch job with per table progress
 */
export function BatchExportDialog(p: BatchExportDialogProps) {
    const notify = useToast();
    const s = useExportSettings();
    const [step, setStep] = React.useState<Step>('tables');
    const [query, setQuery] = React.useState('');
    const [picks, setPicks] = React.useState<Picks>(() => new Map((p.preselect || []).map((t) => [t, null])));
    const [columns, setColumns] = React.useState<Record<string, ExportColumn[] | string>>({});
    const [open, setOpen] = React.useState<Set<string>>(new Set());
    const [previewTable, setPreviewTable] = React.useState('');
    const dest = loadSetting('batch', { dir: '', subfolder: true, existing: 'keep-both' as ExistingFiles, snapshot: true });
    const [dir, setDir] = React.useState<string>(dest.dir || p.defaultDir || '');
    const [useSubfolder, setUseSubfolder] = React.useState<boolean>(dest.subfolder);
    const [subfolder, setSubfolder] = React.useState(`${p.database || 'export'}-${today()}`);
    const [existing, setExisting] = React.useState<ExistingFiles>(dest.existing);
    const [snapshot, setSnapshot] = React.useState<boolean>(dest.snapshot);
    const [batch, setBatch] = React.useState<BatchProgress | null>(null);
    const [starting, setStarting] = React.useState(false);
    const [startError, setStartError] = React.useState('');
    const [hidden, setHidden] = React.useState(false);
    const batchId = React.useRef<string | null>(null);
    const hiddenRef = React.useRef(hidden);
    hiddenRef.current = hidden;

    const ordered = p.tables.filter((t) => picks.has(t.Name));
    const visible = p.tables.filter((t) => t.Name.toLowerCase().includes(query.trim().toLowerCase()));

    const loadColumns = (table: string) => {
        if (columns[table]) return;
        setColumns((c) => ({ ...c, [table]: 'loading' }));
        api.exportColumns(p.conID, { kind: 'table', table }).then((res) =>
            setColumns((c) => ({ ...c, [table]: res.columns || res.error || 'Could not read the columns' }))
        );
    };
    const toggleTable = (table: string) =>
        setPicks((cur) => {
            const n = new Map(cur);
            if (n.has(table)) n.delete(table);
            else n.set(table, null);
            return n;
        });
    const toggleColumn = (table: string, col: string) => {
        const all = columns[table];
        if (!Array.isArray(all)) return;
        setPicks((cur) => {
            const n = new Map(cur);
            // ticking a column of an unticked table picks the table with just that column
            if (!n.has(table)) {
                n.set(table, all.length === 1 ? null : new Set([col]));
                return n;
            }
            const set = new Set(n.get(table) ?? all.map((c) => c.name));
            if (set.has(col)) set.delete(col);
            else set.add(col);
            // every column again : back to "all" (new columns included next time)
            n.set(table, set.size === all.length ? null : set);
            return n;
        });
    };
    const expand = (table: string) => {
        loadColumns(table);
        setOpen((cur) => {
            const n = new Set(cur);
            if (n.has(table)) n.delete(table);
            else n.add(table);
            return n;
        });
    };
    const columnsOf = (table: string): string[] | undefined => {
        const set = picks.get(table);
        const all = columns[table];
        if (!set || !Array.isArray(all)) return undefined;
        // keep the table's own order
        return all.map((c) => c.name).filter((n) => set.has(n));
    };
    const emptyPick = ordered.find((t) => picks.get(t.Name)?.size === 0);

    // preview one of the picked tables
    const shown = ordered.some((t) => t.Name === previewTable) ? previewTable : ordered[0]?.Name || '';
    const previewReq: ExportRequest | null =
        step === 'format' && s.ready && shown && !emptyPick
            ? {
                  conID: p.conID,
                  source: { kind: 'table', table: shown },
                  columns: columnsOf(shown),
                  limit: s.effectiveLimit,
                  format: s.format,
                  options: s.options,
                  compression: s.effectiveCompression,
                  chunk: s.chunk,
              }
            : null;
    const { preview, previewing } = usePreview(previewReq);

    React.useEffect(
        () =>
            onMainEvent<BatchProgress>('export_batch_progress', (ev) => {
                if (ev.batchId !== batchId.current) return;
                setBatch(ev);
                if (ev.state === 'running' || !hiddenRef.current) return;
                const done = ev.items.filter((i) => i.state === 'done').length;
                const failed = ev.items.filter((i) => i.state === 'error').length;
                notify(
                    `Exported ${done} of ${ev.items.length} tables${failed ? ` , ${failed} failed` : ''}`,
                    failed ? 'error' : 'success'
                );
                p.onClose();
            }),
        []
    );

    const running = batch?.state === 'running';
    const close = () => (running ? setHidden(true) : p.onClose());

    const chooseDir = async () => {
        const chosen = await api.exportChooseDir(dir || p.defaultDir);
        if (chosen) setDir(chosen);
    };

    const start = async () => {
        setStarting(true);
        setStartError('');
        saveSetting('batch', { dir, subfolder: useSubfolder, existing, snapshot });
        const res = await api.exportBatchStart({
            conID: p.conID,
            items: ordered.map((t) => ({ table: t.Name, columns: columnsOf(t.Name) })),
            format: s.format,
            options: s.options,
            compression: s.effectiveCompression,
            chunk: s.chunk,
            limit: s.effectiveLimit,
            dir,
            subfolder: useSubfolder ? subfolder.trim() || undefined : undefined,
            existing,
            snapshot,
        });
        setStarting(false);
        if (res.error) setStartError(res.error);
        if (res.batchId) {
            batchId.current = res.batchId;
            setBatch({
                batchId: res.batchId,
                state: 'running',
                dir: res.dir || dir,
                ms: 0,
                items: ordered.map((t) => ({ table: t.Name, state: 'queued', rows: 0, bytes: 0, total: null, files: [] })),
            });
        }
    };

    if (hidden) return null;

    const canNext = step === 'tables' ? ordered.length > 0 && !emptyPick : step === 'format' ? s.ready && !preview?.error : false;
    const go = (to: Step) => setStep(to);
    const stepIndex = STEPS.findIndex(([id]) => id === step);

    // ------------------------------------------------------------ steps

    const tablesStep = (
        <div className="batch-tables">
            <div className="export-inline">
                <div className="batch-search">
                    <Search size={13} />
                    <input className="app-input" autoFocus placeholder="Filter tables" value={query} onChange={(ev) => setQuery(ev.target.value)} />
                </div>
                <span className="toolbar-text">
                    {ordered.length} of {p.tables.length} selected
                </span>
                <span className="toolbar-spacer" />
                <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                        setPicks((cur) => {
                            const n = new Map(cur);
                            visible.forEach((t) => !n.has(t.Name) && n.set(t.Name, null));
                            return n;
                        })
                    }
                >
                    All
                </button>
                <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                        setPicks((cur) => {
                            const n = new Map(cur);
                            visible.forEach((t) => n.delete(t.Name));
                            return n;
                        })
                    }
                >
                    None
                </button>
            </div>
            <div className="batch-list">
                <div className="batch-list-head">
                    <span />
                    <span>Name</span>
                    <span>Type</span>
                    <span>Columns</span>
                </div>
                {visible.map((t) => {
                    const picked = picks.has(t.Name);
                    const set = picks.get(t.Name);
                    const cols = columns[t.Name];
                    const isOpen = open.has(t.Name);
                    return (
                        <div key={t.Name} className={`batch-table ${picked ? 'is-picked' : ''}`}>
                            <div className="batch-table-row">
                                <button type="button" className="batch-expand" title="Choose columns" onClick={() => expand(t.Name)}>
                                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                                <label className="checkbox batch-table-name">
                                    <input type="checkbox" checked={picked} onChange={() => toggleTable(t.Name)} />
                                    {t.Type === 'view' ? <Eye size={13} /> : <Table2 size={13} />}
                                    <span>{t.Name}</span>
                                </label>
                                <span className="batch-table-type">{t.Type === 'view' ? 'view' : 'table'}</span>
                                <button type="button" className="link-btn batch-cols-summary" onClick={() => expand(t.Name)}>
                                    {!picked ? '' : set ? `${set.size} of ${Array.isArray(cols) ? cols.length : '?'} columns` : 'all columns'}
                                </button>
                            </div>
                            {isOpen && (
                                <div className="batch-columns">
                                    {cols === 'loading' || !cols ? (
                                        <div className="toolbar-text">Reading columns…</div>
                                    ) : typeof cols === 'string' ? (
                                        <div className="error-box">{cols}</div>
                                    ) : (
                                        <ColumnPicker
                                            columns={cols}
                                            isSelected={(n) => picked && (!set || set.has(n))}
                                            onToggle={(n) => toggleColumn(t.Name, n)}
                                            onAll={(all) =>
                                                setPicks((cur) => {
                                                    const n = new Map(cur);
                                                    n.set(t.Name, all ? null : new Set());
                                                    return n;
                                                })
                                            }
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {!visible.length && <div className="toolbar-text batch-empty">No tables match “{query}”</div>}
            </div>
            {emptyPick && <div className="error-box">{emptyPick.Name} has no columns selected.</div>}
        </div>
    );

    const formatStep = (
        <div className="export-layout">
            <div className="export-settings">
                <ExportSettings s={s} limitLabel="Only the first" />
            </div>
            <div className="export-side">
                <ExportPreviewPane
                    preview={preview}
                    previewing={previewing}
                    s={s}
                    heading={
                        <>
                            <span className="toolbar-spacer" />
                            <select className="select batch-preview-table" value={shown} onChange={(ev) => setPreviewTable(ev.target.value)}>
                                {ordered.map((t) => (
                                    <option key={t.Name} value={t.Name}>
                                        {t.Name}
                                    </option>
                                ))}
                            </select>
                        </>
                    }
                />
            </div>
        </div>
    );

    const target = dir ? (useSubfolder && subfolder.trim() ? `${dir}/${subfolder.trim()}` : dir) : '';
    const exportStep = (
        <div className="batch-export">
            <div className="field">
                <span className="field-label">Folder</span>
                <div className="export-inline">
                    <code className="batch-dir" title={dir}>
                        {dir ? dir.replace(/^\/Users\/[^/]+/, '~') : 'No folder chosen'}
                    </code>
                    <button type="button" className="btn" onClick={chooseDir}>
                        <FolderOpen size={13} /> Choose…
                    </button>
                </div>
            </div>
            <div className="export-inline">
                <label className="checkbox">
                    <input type="checkbox" checked={useSubfolder} onChange={(ev) => setUseSubfolder(ev.target.checked)} />
                    In a new folder named
                </label>
                <input className="app-input batch-subfolder" disabled={!useSubfolder} value={subfolder} onChange={(ev) => setSubfolder(ev.target.value)} />
            </div>
            <div className="field">
                <span className="field-label">When a file already exists</span>
                <div className="segmented is-compact batch-existing">
                    {(
                        [
                            ['keep-both', 'Keep both'],
                            ['replace', 'Replace'],
                            ['skip', 'Skip the table'],
                        ] as const
                    ).map(([id, label]) => (
                        <button key={id} type="button" className={existing === id ? 'is-active' : ''} onClick={() => setExisting(id)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <label className="checkbox" title="One consistent snapshot for every table , so rows that reference each other match">
                <input type="checkbox" checked={snapshot} onChange={(ev) => setSnapshot(ev.target.checked)} />
                Read every table at the same point in time
            </label>
            <div className="batch-summary">
                <strong>{ordered.length}</strong> table{ordered.length === 1 ? '' : 's'} as <strong>{s.descriptor?.label}</strong>
                {s.compressor ? ` (${s.compressor.label})` : ''}
                {s.chunk.by !== 'none' ? ` , ${describeChunk(s.chunk)}` : ''}
                {s.effectiveLimit ? ` , first ${s.effectiveLimit.toLocaleString()} rows each` : ''}
                {target && (
                    <>
                        {' '}
                        → <code>{target.replace(/^\/Users\/[^/]+/, '~')}</code>
                    </>
                )}
                <div className="batch-names">
                    {ordered.slice(0, 4).map((t) => `${t.Name}${s.extension}`).join('  ')}
                    {ordered.length > 4 ? `  … +${ordered.length - 4}` : ''}
                </div>
            </div>
            {startError && <div className="error-box">{startError}</div>}
        </div>
    );

    // ------------------------------------------------------------ progress

    const icon = (i: BatchItemProgress) =>
        i.state === 'done' ? (
            <CircleCheck size={14} className="status-ok" />
        ) : i.state === 'error' ? (
            <CircleAlert size={14} className="status-error" />
        ) : i.state === 'running' ? (
            <Loader2 size={14} className="spin" />
        ) : i.state === 'skipped' ? (
            <SkipForward size={14} />
        ) : i.state === 'cancelled' ? (
            <Ban size={14} />
        ) : (
            <Clock size={14} />
        );
    const finished = batch ? batch.items.filter((i) => i.state !== 'queued' && i.state !== 'running').length : 0;
    const progressView = batch && (
        <div className="batch-progress">
            <div className="export-inline">
                <div className="export-bar batch-bar">
                    <div className="export-bar-fill" style={{ width: `${(finished / batch.items.length) * 100}%` }} />
                </div>
                <span className="toolbar-text">
                    {finished} of {batch.items.length} tables · {batch.items.reduce((a, i) => a + i.rows, 0).toLocaleString()} rows ·{' '}
                    {formatBytes(batch.items.reduce((a, i) => a + i.bytes, 0))} · {formatDuration(batch.ms)}
                </span>
            </div>
            <div className="batch-list">
                {batch.items.map((i) => (
                    <div key={i.table} className={`batch-item is-${i.state}`} title={i.error || i.files.join('\n')}>
                        {icon(i)}
                        <span className="batch-item-name">{i.table}</span>
                        <span className="batch-item-detail">
                            {i.state === 'error'
                                ? i.error
                                : i.state === 'skipped'
                                ? 'file exists , skipped'
                                : i.state === 'queued'
                                ? 'waiting'
                                : i.state === 'cancelled'
                                ? 'cancelled'
                                : `${i.rows.toLocaleString()}${i.total ? ` / ${i.total.toLocaleString()}` : ''} rows · ${formatBytes(i.bytes)}${
                                      i.files.length > 1 ? ` · ${i.files.length} files` : ''
                                  }`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    // ------------------------------------------------------------ chrome

    const counts = batch && {
        done: batch.items.filter((i) => i.state === 'done').length,
        failed: batch.items.filter((i) => i.state === 'error').length,
    };
    const footer = batch ? (
        <>
            <span className={`export-status ${counts?.failed ? 'is-error' : batch.state === 'done' ? 'is-ok' : ''}`}>
                {batch.state === 'running'
                    ? 'Exporting…'
                    : batch.state === 'cancelled'
                    ? `Cancelled , ${counts?.done} exported`
                    : `${counts?.done} of ${batch.items.length} exported${counts?.failed ? ` , ${counts.failed} failed` : ''}`}
            </span>
            <div className="toolbar-spacer" />
            {running ? (
                <>
                    <button type="button" className="btn is-ghost" onClick={() => setHidden(true)} title="Keep exporting in the background">
                        Hide
                    </button>
                    <button type="button" className="btn is-danger-ghost" onClick={() => api.exportCancel(batch.batchId)}>
                        Cancel
                    </button>
                </>
            ) : (
                <>
                    <button type="button" className="btn is-ghost" onClick={() => api.revealFile(batch.items.find((i) => i.files[0])?.files[0] || batch.dir)}>
                        <FolderOpen size={13} /> Reveal in Finder
                    </button>
                    <button type="button" className="btn is-primary" onClick={p.onClose}>
                        Done
                    </button>
                </>
            )}
        </>
    ) : (
        <>
            <span className="toolbar-text">
                {ordered.length} table{ordered.length === 1 ? '' : 's'}
            </span>
            <div className="toolbar-spacer" />
            <button type="button" className="btn is-ghost" onClick={p.onClose}>
                Cancel
            </button>
            {stepIndex > 0 && (
                <button type="button" className="btn" onClick={() => go(STEPS[stepIndex - 1][0])}>
                    Back
                </button>
            )}
            {step !== 'export' ? (
                <button type="button" className="btn is-primary" disabled={!canNext} onClick={() => go(STEPS[stepIndex + 1][0])}>
                    Next
                </button>
            ) : (
                <button type="button" className="btn is-primary" disabled={!dir || starting} onClick={start}>
                    <Download size={13} /> Export {ordered.length} table{ordered.length === 1 ? '' : 's'}
                </button>
            )}
        </>
    );

    return (
        <Modal
            open
            wide
            className="export-modal batch-modal"
            icon={<Download size={16} />}
            title={
                <span className="export-title">
                    Export tables
                    {p.database && <span className="toolbar-text">{p.database}</span>}
                </span>
            }
            onClose={close}
            footer={footer}
        >
            {!batch && (
                <div className="batch-steps">
                    {STEPS.map(([id, label], i) => (
                        <button
                            key={id}
                            type="button"
                            className={`batch-step ${id === step ? 'is-active' : ''} ${i < stepIndex ? 'is-done' : ''}`}
                            // only back , or forward through valid steps
                            disabled={i > stepIndex && !(i === stepIndex + 1 && canNext)}
                            onClick={() => go(id)}
                        >
                            <span className="batch-step-num">{i + 1}</span>
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {batch ? progressView : step === 'tables' ? tablesStep : step === 'format' ? formatStep : exportStep}
        </Modal>
    );
}
