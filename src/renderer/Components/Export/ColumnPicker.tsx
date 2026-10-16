import React from 'react';
import type { ExportColumn } from 'renderer/api';

export type ColumnPickerProps = {
    columns: ExportColumn[];
    isSelected: (name: string) => boolean;
    onToggle: (name: string) => void;
    /** select every column (true) or none (false) */
    onAll: (all: boolean) => void;
    disabled?: boolean;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Schema list : one field per row , sorted by name , with its type ,
 * the header checkbox selects all / none (only how it's shown , exports keep the table's column order)
 */
export function ColumnPicker(p: ColumnPickerProps) {
    const sorted = React.useMemo(
        () => p.columns.map((c, i) => ({ c, i })).sort((a, b) => collator.compare(a.c.name, b.c.name)),
        [p.columns]
    );
    const count = p.columns.filter((c) => p.isSelected(c.name)).length;
    const all = count === p.columns.length && count > 0;
    const headRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        if (headRef.current) headRef.current.indeterminate = count > 0 && !all;
    }, [count, all]);

    return (
        <div className={`col-list ${p.disabled ? 'is-disabled' : ''}`}>
            <label className="col-list-head">
                <input ref={headRef} type="checkbox" disabled={p.disabled} checked={all} onChange={() => p.onAll(!all)} />
                <span className="col-list-name">Field name</span>
                <span className="col-list-type">Data type</span>
            </label>
            <div className="col-list-body">
                {sorted.map(({ c, i }) => {
                    const on = p.isSelected(c.name);
                    return (
                        <label key={`${c.name}-${i}`} className={`col-row ${on ? 'is-on' : ''}`}>
                            <input type="checkbox" disabled={p.disabled} checked={on} onChange={() => p.onToggle(c.name)} />
                            <span className="col-list-name" title={c.name}>
                                {c.name}
                            </span>
                            <span className="col-list-type">
                                <span className="col-type-pill">{c.sqlType.toLowerCase()}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
