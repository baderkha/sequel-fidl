import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Minimize2, PenLine, Trash2 } from 'lucide-react';
import type { ColSchema } from 'renderer/api';
import type { GridSort } from 'renderer/Components/DataGrid/DataGrid';
import { useToast } from 'renderer/Components/ui/Toasts';
import { JsonTree } from './JsonTree';
import { toRecordDocument } from './documentValues';

function RecordCard(p: {
    row: Record<string, any>;
    schema: ColSchema[];
    number: number;
    disabled: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    const [expanded, setExpanded] = React.useState(true);
    const notify = useToast();
    const document = React.useMemo(() => toRecordDocument(p.row, p.schema), [p.row, p.schema]);
    const identity = p.schema.filter((c) => c.IsPrimaryKey).map((c) => `${c.FieldName}: ${JSON.stringify(document[c.FieldName])}`).join(' · ');
    return (
        <article className="record-card" aria-label={`Record ${p.number}`}>
            <div className="record-card-header">
                <button type="button" className="icon-btn is-small" aria-label={`${expanded ? 'Collapse' : 'Expand'} record ${p.number}`} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <span className="record-number">#{p.number}</span>
                <span className="record-identity" title={identity}>{identity || `${Object.keys(document).length} fields`}</span>
                <div className="toolbar-spacer" />
                <button type="button" className="icon-btn is-small" title="Copy record as JSON" aria-label={`Copy record ${p.number} as JSON`} onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(document, null, 2))
                        .then(() => notify('Copied record as JSON', 'success'))
                        .catch(() => notify('Could not copy the record', 'error'));
                }}><Copy size={13} /></button>
                {p.onEdit && <button type="button" className="btn is-ghost" disabled={p.disabled} onClick={p.onEdit}><PenLine size={12} /> Edit</button>}
                {p.onDelete && <button type="button" className="icon-btn is-small is-danger" title="Delete record" aria-label={`Delete record ${p.number}`} disabled={p.disabled} onClick={p.onDelete}><Trash2 size={13} /></button>}
            </div>
            {expanded && <JsonTree document={document} schema={p.schema} row={p.row} />}
        </article>
    );
}

export function DocumentView(p: {
    rows: Record<string, any>[];
    schema: ColSchema[];
    rowOffset: number;
    loading: boolean;
    empty: string;
    sort: GridSort;
    onSortChange: (sort: GridSort) => void;
    onEdit?: (row: Record<string, any>) => void;
    onDelete?: (index: number) => void;
}) {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [revision, setRevision] = React.useState(0);
    React.useEffect(() => {
        setRevision((v) => v + 1);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [p.rows]);
    const virtualizer = useVirtualizer({
        count: p.rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (index) => 88 + Object.keys(p.rows[index]).length * 22,
        overscan: 4,
    });
    return (
        <div className="document-view" aria-label="JSON records" aria-busy={p.loading}>
            {p.loading && <div className="progress" />}
            <div className="document-toolbar">
                <select className="select" aria-label="Sort JSON records by" value={p.sort?.key || ''} onChange={(ev) => p.onSortChange(ev.target.value ? { key: ev.target.value, dir: p.sort?.dir || 'ASC' } : null)}>
                    <option value="">Unsorted</option>
                    {p.schema.map((c) => <option key={c.FieldName} value={c.FieldName}>{c.FieldName}</option>)}
                </select>
                <button type="button" className="icon-btn is-small" title={p.sort?.dir === 'DESC' ? 'Sort ascending' : 'Sort descending'} disabled={!p.sort} onClick={() => p.sort && p.onSortChange({ ...p.sort, dir: p.sort.dir === 'ASC' ? 'DESC' : 'ASC' })}>
                    {p.sort?.dir === 'DESC' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                </button>
                <div className="toolbar-spacer" />
                <button type="button" className="btn is-ghost" onClick={() => setRevision((v) => v + 1)}><Minimize2 size={12} /> Collapse nested</button>
            </div>
            <div className="document-scroll" ref={scrollRef}>
                <div className="document-list" style={{ height: virtualizer.getTotalSize() }}>
                    {virtualizer.getVirtualItems().map((item) => (
                        <div key={String(item.key ?? item.index)} data-index={item.index} ref={virtualizer.measureElement} className="document-item" style={{ transform: `translateY(${item.start}px)` }}>
                            <RecordCard
                                key={`${revision}:${item.index}`}
                                row={p.rows[item.index]}
                                schema={p.schema}
                                number={p.rowOffset + item.index + 1}
                                disabled={p.loading}
                                onEdit={p.onEdit ? () => p.onEdit?.(p.rows[item.index]) : undefined}
                                onDelete={p.onDelete ? () => p.onDelete?.(item.index) : undefined}
                            />
                        </div>
                    ))}
                </div>
                {!p.rows.length && !p.loading && <div className="document-empty">{p.empty}</div>}
            </div>
        </div>
    );
}
