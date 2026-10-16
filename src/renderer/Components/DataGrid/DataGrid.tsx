import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Braces, Copy, KeyRound, Maximize2 } from 'lucide-react';
import { ContextMenu, MenuEntry, useContextMenu } from '../ui/ContextMenu';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toasts';
import {
    cellToText,
    compareValues,
    formatCell,
    isNumericValue,
} from './format';

export type GridColumn = {
    key: string;
    title?: string;
    /** faint type hint in the header , e.g. varchar(255) */
    typeLabel?: string;
    numeric?: boolean;
    primaryKey?: boolean;
};

export type GridSort = { key: string; dir: 'ASC' | 'DESC' } | null;

export type DataGridProps = {
    columns: GridColumn[];
    rows: any[];
    /** controlled sort , leave undefined to let the grid manage it */
    sort?: GridSort;
    onSortChange?: (sort: GridSort) => void;
    /** rows are already sorted by the caller (server side sorting) */
    manualSort?: boolean;
    loading?: boolean;
    /** number of the first row , for the row gutter when paginating */
    rowOffset?: number;
    empty?: React.ReactNode;
    /** remembers column widths between mounts (e.g. per table) */
    storageKey?: string;
    /** row selection (indexes into `rows`) , enables checkboxes when set */
    selection?: Set<number>;
    onSelectionChange?: (selection: Set<number>) => void;
    /** delete / backspace with rows selected (gets the effective selection) */
    onDeleteRequest?: (selection: Set<number>) => void;
    /** extra right click entries , for the selection the click results in */
    selectionMenu?: (selection: Set<number>) => MenuEntry[];
};

const EMPTY = new Set<number>();

const ROW_H = 26;
const MIN_COL_W = 60;
const MAX_AUTO_COL_W = 420;
const savedWidths = new Map<string, Record<string, number>>();

const measureColumn = (col: GridColumn, rows: any[]) => {
    const header =
        (col.title || col.key).length * 7.4 +
        (col.typeLabel ? col.typeLabel.length * 6 + 6 : 0) +
        (col.primaryKey ? 18 : 0) +
        40;
    let longest = 0;
    for (let i = 0; i < Math.min(rows.length, 80); i++) {
        longest = Math.max(
            longest,
            formatCell(rows[i][col.key], col.typeLabel).text.length
        );
    }
    const body = Math.min(longest, 60) * 7.3 + 22;
    return Math.round(
        Math.min(MAX_AUTO_COL_W, Math.max(MIN_COL_W + 20, header, body))
    );
};

const nextSort = (current: GridSort, key: string): GridSort => {
    if (!current || current.key !== key) {
        return { key, dir: 'ASC' };
    }
    return current.dir === 'ASC' ? { key, dir: 'DESC' } : null;
};

const copy = (text: string) => navigator.clipboard.writeText(text);

/**
 * Virtualized , sortable , resizable data grid
 */
export function DataGrid(p: DataGridProps) {
    const notify = useToast();
    const menu = useContextMenu();
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const rootRef = React.useRef<HTMLDivElement>(null);

    const [ownSort, setOwnSort] = React.useState<GridSort>(null);
    const sort = p.sort !== undefined ? p.sort : ownSort;
    const setSort = (s: GridSort) => {
        if (p.sort === undefined) {
            setOwnSort(s);
        }
        p.onSortChange && p.onSortChange(s);
    };

    // numeric alignment falls back to sniffing the data
    const columns = React.useMemo(
        () =>
            p.columns.map((c) => {
                if (c.numeric !== undefined) {
                    return c;
                }
                const sample = p.rows.find(
                    (r) => r[c.key] !== null && r[c.key] !== undefined
                );
                return { ...c, numeric: sample ? isNumericValue(sample[c.key]) : false };
            }),
        [p.columns, p.rows]
    );

    const colSignature = columns.map((c) => c.key).join('\u0000');
    const [widths, setWidths] = React.useState<Record<string, number>>({});
    React.useEffect(() => {
        const saved = (p.storageKey && savedWidths.get(p.storageKey)) || {};
        const next: Record<string, number> = {};
        columns.forEach((c) => {
            next[c.key] = saved[c.key] || measureColumn(c, p.rows);
        });
        setWidths(next);
        // only re-measure when the columns change , not on every page of rows
    }, [colSignature, p.storageKey, p.rows.length > 0]);

    const setWidth = (key: string, width: number) =>
        setWidths((w) => {
            const next = { ...w, [key]: width };
            if (p.storageKey) {
                savedWidths.set(p.storageKey, next);
            }
            return next;
        });

    const rows = React.useMemo(() => {
        if (!sort || p.manualSort) {
            return p.rows;
        }
        const dir = sort.dir === 'ASC' ? 1 : -1;
        return [...p.rows].sort((x, y) => {
            const a = x[sort.key];
            const b = y[sort.key];
            if (a === null || a === undefined || b === null || b === undefined) {
                return compareValues(a, b);
            }
            return dir * compareValues(a, b);
        });
    }, [p.rows, sort, p.manualSort]);

    const selectable = !!p.onSelectionChange;
    const selection = p.selection || EMPTY;
    const anchor = React.useRef<number | null>(null);
    const select = (next: Set<number>) => p.onSelectionChange && p.onSelectionChange(next);
    const range = (from: number, to: number) => {
        const next = new Set<number>();
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(i);
        return next;
    };
    // a click on a row : plain => clears , ⌘ / checkbox => toggle , shift => range from the anchor
    const clickRow = (
        index: number,
        ev: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
        toggle = false
    ) => {
        if (!selectable) {
            return;
        }
        if (ev.shiftKey && anchor.current !== null) {
            select(range(anchor.current, index));
            return;
        }
        if (ev.metaKey || ev.ctrlKey || toggle) {
            const next = new Set(selection);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            anchor.current = index;
            select(next);
            return;
        }
        anchor.current = index;
        if (selection.size) {
            select(new Set());
        }
    };
    // new data => nothing selected
    React.useEffect(() => {
        if (selection.size) {
            select(new Set());
        }
        anchor.current = null;
    }, [p.rows]);

    const gutterW = Math.max(
        selectable ? 58 : 44,
        `${(p.rowOffset || 0) + rows.length}`.length * 7 + 22
    );
    const colW = (key: string) => widths[key] || 120;
    const totalW = gutterW + columns.reduce((sum, c) => sum + colW(c.key), 0);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_H,
        overscan: 16,
    });

    // active cell , reset when the data changes
    const [active, setActive] = React.useState<{ row: number; col: number } | null>(
        null
    );
    React.useEffect(() => setActive(null), [p.rows, colSignature]);
    const [viewer, setViewer] = React.useState<{ row: number; col: number } | null>(
        null
    );

    const scrollIntoView = (row: number, col: number) => {
        virtualizer.scrollToIndex(row, { align: 'auto' });
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        let left = gutterW;
        for (let i = 0; i < col; i++) {
            left += colW(columns[i].key);
        }
        const right = left + colW(columns[col].key);
        if (left - gutterW < el.scrollLeft) {
            el.scrollLeft = left - gutterW;
        } else if (right > el.scrollLeft + el.clientWidth) {
            el.scrollLeft = right - el.clientWidth;
        }
    };

    const valueAt = (row: number, col: number) => rows[row]?.[columns[col].key];
    const textAt = (row: number, col: number, pretty = false) =>
        cellToText(valueAt(row, col), columns[col].typeLabel, pretty);

    const copyCell = (row: number, col: number) =>
        copy(textAt(row, col)).then(() => notify('Copied value', 'success'));
    const copyRowJSON = (row: number) =>
        copy(JSON.stringify(rows[row], null, 2)).then(() =>
            notify('Copied row as JSON', 'success')
        );
    const copyRowTSV = (row: number) =>
        copy(columns.map((_, c) => textAt(row, c)).join('\t')).then(() =>
            notify('Copied row', 'success')
        );

    const onKeyDown = (ev: React.KeyboardEvent) => {
        if (!rows.length || !columns.length) {
            return;
        }
        const cur = active || { row: 0, col: 0 };
        if (selectable) {
            if ((ev.metaKey || ev.ctrlKey) && ev.key === 'a') {
                ev.preventDefault();
                select(range(0, rows.length - 1));
                return;
            }
            if (ev.key === 'Escape' && selection.size) {
                ev.preventDefault();
                select(new Set());
                return;
            }
            if ((ev.key === 'Delete' || ev.key === 'Backspace') && p.onDeleteRequest) {
                ev.preventDefault();
                const target = selection.size ? selection : active ? new Set([active.row]) : EMPTY;
                if (!target.size) {
                    return;
                }
                select(target);
                p.onDeleteRequest(target);
                return;
            }
            if (ev.shiftKey && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
                ev.preventDefault();
                const row = Math.min(
                    rows.length - 1,
                    Math.max(0, cur.row + (ev.key === 'ArrowDown' ? 1 : -1))
                );
                if (anchor.current === null) {
                    anchor.current = cur.row;
                }
                select(range(anchor.current, row));
                setActive({ row, col: cur.col });
                scrollIntoView(row, cur.col);
                return;
            }
        }
        const moves: Record<string, [number, number]> = {
            ArrowDown: [1, 0],
            ArrowUp: [-1, 0],
            ArrowRight: [0, 1],
            ArrowLeft: [0, -1],
        };
        if (moves[ev.key]) {
            ev.preventDefault();
            const [dr, dc] = moves[ev.key];
            const jump = ev.metaKey || ev.ctrlKey;
            const row = jump
                ? dr > 0
                    ? rows.length - 1
                    : dr < 0
                    ? 0
                    : cur.row
                : Math.min(rows.length - 1, Math.max(0, cur.row + dr));
            const col = jump
                ? dc > 0
                    ? columns.length - 1
                    : dc < 0
                    ? 0
                    : cur.col
                : Math.min(columns.length - 1, Math.max(0, cur.col + dc));
            setActive({ row, col });
            scrollIntoView(row, col);
        } else if (ev.key === 'PageDown' || ev.key === 'PageUp') {
            ev.preventDefault();
            const page = Math.floor((scrollRef.current?.clientHeight || 300) / ROW_H) - 1;
            const row = Math.min(
                rows.length - 1,
                Math.max(0, cur.row + (ev.key === 'PageDown' ? page : -page))
            );
            setActive({ row, col: cur.col });
            scrollIntoView(row, cur.col);
        } else if ((ev.metaKey || ev.ctrlKey) && ev.key === 'c' && active) {
            ev.preventDefault();
            copyCell(active.row, active.col);
        } else if ((ev.key === 'Enter' || ev.key === ' ') && active) {
            ev.preventDefault();
            setViewer(active);
        }
    };

    const startResize = (key: string) => (ev: React.MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const startX = ev.clientX;
        const startW = colW(key);
        const handle = ev.currentTarget as HTMLElement;
        handle.classList.add('is-dragging');
        document.body.classList.add('is-resizing');
        document.body.style.cursor = 'col-resize';
        const onMove = (e: MouseEvent) =>
            setWidth(key, Math.max(MIN_COL_W, startW + e.clientX - startX));
        const onUp = () => {
            handle.classList.remove('is-dragging');
            document.body.classList.remove('is-resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const autoFit = (col: GridColumn) => (ev: React.MouseEvent) => {
        ev.stopPropagation();
        setWidth(col.key, measureColumn(col, rows));
    };

    const items = virtualizer.getVirtualItems();
    const rowOffset = p.rowOffset || 0;

    return (
        <div
            ref={rootRef}
            className="grid"
            tabIndex={0}
            onKeyDown={onKeyDown}
        >
            {p.loading && <div className="progress" />}
            <div className="grid-scroll" ref={scrollRef}>
                <div className="grid-header" style={{ width: totalW, minWidth: '100%' }}>
                    <div className="grid-gutter" style={{ width: gutterW }}>
                        {selectable && rows.length > 0 && (
                            <input
                                type="checkbox"
                                className="grid-check is-visible"
                                title="Select all rows on this page (⌘A)"
                                checked={selection.size === rows.length}
                                ref={(el) => {
                                    if (el) {
                                        el.indeterminate =
                                            selection.size > 0 && selection.size < rows.length;
                                    }
                                }}
                                onChange={() =>
                                    select(
                                        selection.size === rows.length
                                            ? new Set()
                                            : range(0, rows.length - 1)
                                    )
                                }
                            />
                        )}
                    </div>
                    {columns.map((c) => {
                        const sorted = sort && sort.key === c.key ? sort.dir : null;
                        return (
                            <div
                                key={c.key}
                                className={`grid-hcell ${sorted ? 'is-sorted' : ''} ${
                                    c.numeric ? 'is-numeric' : ''
                                }`}
                                style={{ width: colW(c.key) }}
                                title={`${c.title || c.key}${
                                    c.typeLabel ? ` · ${c.typeLabel}` : ''
                                }\nClick to sort`}
                                onClick={() => setSort(nextSort(sort, c.key))}
                            >
                                {c.primaryKey && <KeyRound size={12} className="pk-icon" />}
                                <span className="grid-hcell-name">{c.title || c.key}</span>
                                {c.typeLabel && (
                                    <span className="grid-hcell-type">{c.typeLabel}</span>
                                )}
                                {sorted === 'ASC' && <ArrowUp size={13} className="sort-icon" />}
                                {sorted === 'DESC' && (
                                    <ArrowDown size={13} className="sort-icon" />
                                )}
                                <div
                                    className="grid-resize"
                                    onMouseDown={startResize(c.key)}
                                    onClick={(ev) => ev.stopPropagation()}
                                    onDoubleClick={autoFit(c)}
                                />
                            </div>
                        );
                    })}
                </div>
                <div
                    className="grid-body"
                    style={{ height: virtualizer.getTotalSize(), width: totalW, minWidth: '100%' }}
                >
                    {items.map((item) => {
                        const row = rows[item.index];
                        const isRowActive = active && active.row === item.index;
                        const checked = selection.has(item.index);
                        return (
                            <div
                                key={item.index}
                                className={`grid-row ${item.index % 2 ? 'is-odd' : ''} ${
                                    isRowActive ? 'is-selected' : ''
                                } ${checked ? 'is-checked' : ''}`}
                                style={{
                                    transform: `translateY(${item.start}px)`,
                                    width: totalW,
                                    minWidth: '100%',
                                }}
                            >
                                <div
                                    className="grid-gutter"
                                    style={{ width: gutterW }}
                                    onMouseDown={(ev) => {
                                        if (selectable) {
                                            ev.preventDefault();
                                            clickRow(item.index, ev, true);
                                        }
                                    }}
                                >
                                    {selectable && (
                                        <input
                                            type="checkbox"
                                            className="grid-check"
                                            tabIndex={-1}
                                            checked={checked}
                                            readOnly
                                        />
                                    )}
                                    <span className="grid-rownum">{rowOffset + item.index + 1}</span>
                                </div>
                                {columns.map((c, colIdx) => {
                                    const { text, kind } = formatCell(row[c.key], c.typeLabel);
                                    const isActive = isRowActive && active.col === colIdx;
                                    return (
                                        <div
                                            key={c.key}
                                            className={`grid-cell is-${kind} ${
                                                c.numeric ? 'is-numeric' : ''
                                            } ${isActive ? 'is-active' : ''}`}
                                            style={{ width: colW(c.key) }}
                                            onMouseDown={(ev) => {
                                                setActive({ row: item.index, col: colIdx });
                                                if (ev.button === 0) {
                                                    clickRow(item.index, ev);
                                                }
                                            }}
                                            onDoubleClick={() =>
                                                setViewer({ row: item.index, col: colIdx })
                                            }
                                            onContextMenu={(ev) => {
                                                setActive({ row: item.index, col: colIdx });
                                                // right click outside the selection selects that row (like Finder)
                                                let extra: MenuEntry[] = [];
                                                if (selectable && p.selectionMenu) {
                                                    let target = selection;
                                                    if (!selection.has(item.index)) {
                                                        target = new Set([item.index]);
                                                        select(target);
                                                        anchor.current = item.index;
                                                    }
                                                    extra = ['separator', ...p.selectionMenu(target)];
                                                }
                                                menu.open(ev, [
                                                    {
                                                        label: 'Copy Value',
                                                        icon: <Copy size={14} />,
                                                        kbd: '⌘C',
                                                        onSelect: () => copyCell(item.index, colIdx),
                                                    },
                                                    {
                                                        label: 'Copy Row',
                                                        icon: <Copy size={14} />,
                                                        onSelect: () => copyRowTSV(item.index),
                                                    },
                                                    {
                                                        label: 'Copy Row as JSON',
                                                        icon: <Braces size={14} />,
                                                        onSelect: () => copyRowJSON(item.index),
                                                    },
                                                    'separator',
                                                    {
                                                        label: 'View Value',
                                                        icon: <Maximize2 size={14} />,
                                                        kbd: '↵',
                                                        onSelect: () =>
                                                            setViewer({
                                                                row: item.index,
                                                                col: colIdx,
                                                            }),
                                                    },
                                                    ...extra,
                                                ]);
                                            }}
                                        >
                                            <span>{text}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
                {!rows.length && !p.loading && (
                    <div className="grid-empty">{p.empty || 'No rows'}</div>
                )}
            </div>
            <ContextMenu {...menu} />
            <Modal
                open={!!viewer}
                wide
                title={
                    viewer ? (
                        <>
                            <code>{columns[viewer.col]?.key}</code>
                            <span className="toolbar-text">
                                row {rowOffset + viewer.row + 1}
                                {columns[viewer.col]?.typeLabel
                                    ? ` · ${columns[viewer.col].typeLabel}`
                                    : ''}
                            </span>
                        </>
                    ) : (
                        ''
                    )
                }
                onClose={() => {
                    setViewer(null);
                    rootRef.current?.focus();
                }}
                footer={
                    <>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => viewer && copyCell(viewer.row, viewer.col)}
                        >
                            <Copy size={13} /> Copy
                        </button>
                        <button
                            type="button"
                            className="btn is-primary"
                            autoFocus
                            onClick={() => {
                                setViewer(null);
                                rootRef.current?.focus();
                            }}
                        >
                            Done
                        </button>
                    </>
                }
            >
                {viewer && (
                    <pre className="value-viewer">{textAt(viewer.row, viewer.col, true)}</pre>
                )}
            </Modal>
        </div>
    );
}
