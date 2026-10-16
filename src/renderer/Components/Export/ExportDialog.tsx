import React from 'react';
import { CircleAlert, CircleCheck, Download, FolderOpen } from 'lucide-react';
import { api, ExportColumn, ExportProgress, ExportRequest, ExportSourceSpec, onMainEvent } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';
import { useToast } from 'renderer/Components/ui/Toasts';
import { ColumnPicker } from './ColumnPicker';
import { describeChunk, ExportPreviewPane, ExportSettings, formatBytes, formatDuration, usePreview, useExportSettings } from './ExportSettings';

export { formatBytes } from './ExportSettings';

/** what to export */
export type ExportTarget = {
    source: ExportSourceSpec;
    /** file name without extension , e.g. the table */
    name: string;
    /** under the title , e.g. "2 filters · sorted by id ↓" */
    detail?: string;
};

export type ExportDialogProps = {
    conID: string;
    target: ExportTarget;
    /** the save dialog starts here (project folder) */
    defaultDir: string | null;
    onClose: () => void;
};

/**
 * Export a table / query : format + options , columns , compression , preview , progress
 */
export function ExportDialog(p: ExportDialogProps) {
    const notify = useToast();
    const s = useExportSettings();
    const [columns, setColumns] = React.useState<ExportColumn[] | null>(null);
    const [columnsError, setColumnsError] = React.useState('');
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [job, setJob] = React.useState<ExportProgress | null>(null);
    const [starting, setStarting] = React.useState(false);
    const [startError, setStartError] = React.useState('');
    /** closed while exporting : keep listening , toast at the end */
    const [hidden, setHidden] = React.useState(false);
    const jobId = React.useRef<string | null>(null);
    const hiddenRef = React.useRef(hidden);
    hiddenRef.current = hidden;

    // the columns of the source
    React.useEffect(() => {
        api.exportColumns(p.conID, p.target.source).then((res) => {
            if (res.error || !res.columns) {
                setColumnsError(res.error || 'Could not read the columns');
                return;
            }
            setColumns(res.columns);
            setSelected(new Set(res.columns.map((c) => c.name)));
        });
    }, [p.conID, JSON.stringify(p.target.source)]);

    const fileName = `${p.target.name}${s.extension}`;
    const picked = columns ? columns.filter((c) => selected.has(c.name)).map((c) => c.name) : [];

    const req: ExportRequest | null =
        s.ready && columns && picked.length
            ? {
                  conID: p.conID,
                  source: p.target.source,
                  columns: picked.length === columns.length ? undefined : picked,
                  limit: s.effectiveLimit,
                  format: s.format,
                  options: s.options,
                  compression: s.effectiveCompression,
                  chunk: s.chunk,
                  defaultDir: p.defaultDir,
                  baseName: p.target.name,
              }
            : null;
    const { preview, previewing } = usePreview(req);

    // progress of our job
    React.useEffect(
        () =>
            onMainEvent<ExportProgress>('export_progress', (ev) => {
                if (ev.jobId !== jobId.current) return;
                setJob(ev);
                if (ev.state === 'running' || !hiddenRef.current) return;
                // finished in the background
                const name = ev.path.slice(ev.path.lastIndexOf('/') + 1);
                if (ev.state === 'done')
                    notify(
                        `Exported ${ev.rows.toLocaleString()} rows to ${ev.files.length > 1 ? `${ev.files.length} files (${name})` : name}`,
                        'success'
                    );
                if (ev.state === 'error') notify(`Export of ${name} failed: ${ev.error}`, 'error');
                p.onClose();
            }),
        []
    );

    const running = job?.state === 'running';
    const close = () => (running ? setHidden(true) : p.onClose());

    const start = async () => {
        if (!req) return;
        setStarting(true);
        setStartError('');
        const res = await api.exportStart(req);
        setStarting(false);
        if (res.error) setStartError(res.error);
        if (res.jobId) {
            jobId.current = res.jobId;
            setJob({ jobId: res.jobId, state: 'running', rows: 0, bytes: 0, total: null, ms: 0, path: res.path || '', parts: 0, files: [] });
        }
    };

    if (hidden) return null;

    const toggle = (name: string) =>
        setSelected((cur) => {
            const n = new Set(cur);
            if (n.has(name)) n.delete(name);
            else n.add(name);
            return n;
        });

    const progressFooter = job && (
        <>
            {job.state === 'running' && (
                <div className="export-status">
                    <div className="export-bar">
                        <div
                            className={`export-bar-fill ${job.total ? '' : 'is-indeterminate'}`}
                            style={job.total ? { width: `${Math.min(100, (job.rows / job.total) * 100)}%` } : undefined}
                        />
                    </div>
                    <span className="toolbar-text">
                        {job.rows.toLocaleString()}
                        {job.total ? ` / ${job.total.toLocaleString()}` : ''} rows · {formatBytes(job.bytes)}
                        {job.parts > 1 ? ` · ${job.parts} files` : ''}
                    </span>
                </div>
            )}
            {job.state === 'done' && (
                <span className="export-status is-ok">
                    <CircleCheck size={14} /> {job.rows.toLocaleString()} rows ·{' '}
                    {job.files.length > 1 ? `${job.files.length} files · ` : ''}
                    {formatBytes(job.bytes)} · {formatDuration(job.ms)}
                </span>
            )}
            {job.state === 'error' && (
                <span className="export-status is-error" title={job.error}>
                    <CircleAlert size={14} /> {job.error}
                </span>
            )}
            {job.state === 'cancelled' && <span className="export-status">Export cancelled</span>}
            <div className="toolbar-spacer" />
            {job.state === 'running' ? (
                <>
                    <button type="button" className="btn is-ghost" onClick={() => setHidden(true)} title="Keep exporting in the background">
                        Hide
                    </button>
                    <button type="button" className="btn is-danger-ghost" onClick={() => api.exportCancel(job.jobId)}>
                        Cancel Export
                    </button>
                </>
            ) : (
                <>
                    {job.state === 'done' && (
                        <button type="button" className="btn is-ghost" onClick={() => api.revealFile(job.files[0] || job.path)}>
                            <FolderOpen size={13} /> Reveal in Finder
                        </button>
                    )}
                    {job.state !== 'done' && (
                        <button type="button" className="btn is-ghost" onClick={() => setJob(null)}>
                            Back
                        </button>
                    )}
                    <button type="button" className="btn is-primary" onClick={p.onClose}>
                        Done
                    </button>
                </>
            )}
        </>
    );

    const footer = progressFooter || (
        <>
            <code className="export-filename" title="File name">
                {fileName}
            </code>
            {s.chunk.by !== 'none' && <span className="toolbar-text">{describeChunk(s.chunk)}</span>}
            {startError && <span className="export-status is-error">{startError}</span>}
            <div className="toolbar-spacer" />
            <button type="button" className="btn is-ghost" onClick={p.onClose}>
                Cancel
            </button>
            <button type="button" className="btn is-primary" disabled={!req || starting || !!preview?.error} onClick={start}>
                <Download size={13} /> {starting ? 'Choose where…' : 'Export…'}
            </button>
        </>
    );

    return (
        <Modal
            open
            wide
            className="export-modal"
            icon={<Download size={16} />}
            title={
                <span className="export-title">
                    Export <code>{p.target.name}</code>
                    {p.target.detail && <span className="toolbar-text">{p.target.detail}</span>}
                </span>
            }
            onClose={close}
            footer={footer}
        >
            {columnsError ? (
                <div className="error-box">{columnsError}</div>
            ) : (
                <div className="export-layout">
                    <div className="export-settings">
                        <ExportSettings s={s} />
                    </div>
                    <div className="export-side">
                        <div className="field export-columns-field">
                            <span className="field-label">Columns{columns ? ` · ${picked.length} of ${columns.length}` : ''}</span>
                            {columns ? (
                                <ColumnPicker
                                    columns={columns}
                                    isSelected={(n) => selected.has(n)}
                                    onToggle={toggle}
                                    onAll={(all) => setSelected(new Set(all ? columns.map((c) => c.name) : []))}
                                />
                            ) : (
                                <div className="toolbar-text">Reading columns…</div>
                            )}
                        </div>
                        <ExportPreviewPane preview={preview} previewing={previewing} s={s} />
                    </div>
                </div>
            )}
        </Modal>
    );
}
