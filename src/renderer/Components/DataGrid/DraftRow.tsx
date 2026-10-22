import React from 'react';
import { Plus } from 'lucide-react';
import type { GridColumn } from './DataGrid';

export type GridDraftCell = {
    mode: 'default' | 'value' | 'null';
    value: string;
    readOnly?: string;
    nullable: boolean;
    hasDefault: boolean;
};

export type GridDraft = {
    cells: Record<string, GridDraftCell>;
    onChange: (column: string, cell: GridDraftCell) => void;
    onCancel: () => void;
    onReview: () => void;
    disabled?: boolean;
};

/** A local draft above the saved rows; leaving a field never writes it. */
export function DraftRow(
    p: GridDraft & {
        columns: GridColumn[];
        columnWidth: (key: string) => number;
        gutterWidth: number;
        width: number;
    }
) {
    const host = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const scroll = host.current?.closest('.grid-scroll');
        if (scroll) scroll.scrollTop = 0;
        const first = host.current?.querySelector<HTMLTextAreaElement>('textarea');
        (first || host.current)?.focus();
    }, []);

    return (
        <div
            ref={host}
            className="grid-draft-row"
            role="group"
            tabIndex={-1}
            aria-label="New record"
            style={{ width: p.width, minWidth: '100%' }}
            onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.nativeEvent.isComposing) return;
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    p.onCancel();
                } else if (ev.key === 'Enter' && !ev.shiftKey) {
                    if (
                        !(ev.target instanceof HTMLTextAreaElement) &&
                        ev.target !== ev.currentTarget &&
                        !ev.ctrlKey &&
                        !ev.metaKey
                    )
                        return;
                    ev.preventDefault();
                    const fields = Array.from(
                        host.current?.querySelectorAll<HTMLTextAreaElement>(
                            'textarea:not(:disabled)'
                        ) || []
                    );
                    const next =
                        fields[
                            fields.indexOf(ev.target as HTMLTextAreaElement) + 1
                        ];
                    if (ev.ctrlKey || ev.metaKey || !next) p.onReview();
                    else next.focus();
                }
            }}
        >
            <div
                className="grid-gutter"
                style={{ width: p.gutterWidth }}
                title="New record"
            >
                <Plus size={14} />
            </div>
            {p.columns.map((column) => {
                const cell = p.cells[column.key];
                if (!cell) return null;
                return (
                    <div
                        key={column.key}
                        className="grid-draft-cell"
                        style={{ width: p.columnWidth(column.key) }}
                    >
                        {cell.readOnly ? (
                            <span
                                className="grid-draft-generated"
                                title="Filled automatically by the database"
                            >
                                {cell.readOnly}
                            </span>
                        ) : (
                            <>
                                <textarea
                                    aria-label={`New ${
                                        column.title || column.key
                                    }`}
                                    aria-required={
                                        !cell.nullable && !cell.hasDefault
                                    }
                                    className="grid-cell-editor"
                                    rows={1}
                                    spellCheck={false}
                                    disabled={
                                        p.disabled || cell.mode === 'null'
                                    }
                                    placeholder={
                                        cell.mode === 'null'
                                            ? 'NULL'
                                            : cell.mode === 'default'
                                            ? cell.hasDefault || cell.nullable
                                                ? 'DEFAULT'
                                                : 'Required'
                                            : ''
                                    }
                                    value={
                                        cell.mode === 'value' ? cell.value : ''
                                    }
                                    onChange={(ev) =>
                                        p.onChange(column.key, {
                                            ...cell,
                                            mode: 'value',
                                            value: ev.target.value,
                                        })
                                    }
                                />
                                <select
                                    aria-label={`Value mode for ${
                                        column.title || column.key
                                    }`}
                                    value={cell.mode}
                                    disabled={p.disabled}
                                    onChange={(ev) => {
                                        const input =
                                            ev.currentTarget.parentElement?.querySelector(
                                                'textarea'
                                            );
                                        p.onChange(column.key, {
                                            ...cell,
                                            mode: ev.target
                                                .value as GridDraftCell['mode'],
                                        });
                                        if (ev.target.value === 'value')
                                            window.requestAnimationFrame(() =>
                                                input?.focus()
                                            );
                                    }}
                                >
                                    <option value="default">
                                        {cell.hasDefault || cell.nullable
                                            ? 'Default'
                                            : 'Required'}
                                    </option>
                                    <option value="value">Value</option>
                                    {cell.nullable && (
                                        <option value="null">NULL</option>
                                    )}
                                </select>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
