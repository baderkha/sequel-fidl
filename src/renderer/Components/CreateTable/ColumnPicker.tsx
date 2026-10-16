import { X } from 'lucide-react';

export type PickerOption<T> = { value: T; label: string };

export type ColumnPickerProps<T> = {
    options: PickerOption<T>[];
    /** picked values , in order (the order matters for composite keys) */
    value: T[];
    onChange: (value: T[]) => void;
    invalid?: boolean;
    placeholder?: string;
    disabled?: boolean;
    /** prefix length per value (index columns) */
    lengths?: Record<string, number>;
    /** which values can take a length */
    lengthFor?: (value: T) => boolean;
    onLengths?: (lengths: Record<string, number>) => void;
};

/**
 * Ordered multi select rendered as chips , used for index / foreign key columns
 */
export function ColumnPicker<T extends string | number>(p: ColumnPickerProps<T>) {
    const remaining = p.options.filter((o) => !p.value.includes(o.value));
    const label = (v: T) => p.options.find((o) => o.value === v)?.label ?? `${v}`;
    return (
        <div className={`chips ${p.invalid ? 'is-invalid' : ''}`}>
            {p.value.map((v, i) => (
                <span key={`${v}`} className="chip">
                    {p.value.length > 1 && <span className="chip-order">{i + 1}</span>}
                    {label(v)}
                    {p.lengthFor && p.lengthFor(v) && (
                        <input
                            className="chip-len"
                            type="number"
                            min={1}
                            placeholder="len"
                            title="Prefix length (index only the first N characters)"
                            disabled={p.disabled}
                            value={p.lengths?.[`${v}`] || ''}
                            onChange={(ev) => {
                                const next = { ...(p.lengths || {}) };
                                const n = parseInt(ev.target.value, 10);
                                if (n > 0) {
                                    next[`${v}`] = n;
                                } else {
                                    delete next[`${v}`];
                                }
                                p.onLengths && p.onLengths(next);
                            }}
                        />
                    )}
                    <button
                        type="button"
                        disabled={p.disabled}
                        className="chip-remove"
                        title="Remove"
                        onClick={() => p.onChange(p.value.filter((x) => x !== v))}
                    >
                        <X size={11} />
                    </button>
                </span>
            ))}
            {remaining.length > 0 && !p.disabled && (
                <select
                    className="chip-add"
                    value=""
                    onChange={(ev) => {
                        const opt = remaining[+ev.target.value];
                        if (opt) {
                            p.onChange([...p.value, opt.value]);
                        }
                    }}
                >
                    <option value="" disabled>
                        {p.value.length ? '+ add' : p.placeholder || '+ add column'}
                    </option>
                    {remaining.map((o, idx) => (
                        <option key={`${o.value}`} value={idx}>
                            {o.label}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}
