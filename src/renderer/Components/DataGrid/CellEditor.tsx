import React from 'react';

/** Keep text selection and editing shortcuts inside the cell. */
export function CellEditor(p: {
    initialValue: string;
    label: string;
    isNull: boolean;
    onFinish: (value: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = React.useState(p.initialValue);
    const finished = React.useRef(false);
    const finish = () => {
        if (finished.current) return;
        finished.current = true;
        p.onFinish(value);
    };

    return (
        <textarea
            className="grid-cell-editor"
            aria-label={p.label}
            title="Enter to review changes · Shift+Enter for a new line · Escape to cancel"
            autoFocus
            rows={1}
            spellCheck={false}
            placeholder={p.isNull ? 'NULL' : undefined}
            value={value}
            onFocus={(ev) => ev.currentTarget.select()}
            onChange={(ev) => setValue(ev.target.value)}
            onBlur={finish}
            onMouseDown={(ev) => ev.stopPropagation()}
            onDoubleClick={(ev) => ev.stopPropagation()}
            onContextMenu={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.nativeEvent.isComposing) return;
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    finished.current = true;
                    p.onCancel();
                } else if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    finish();
                    ev.currentTarget.closest<HTMLElement>('.grid')?.focus();
                }
            }}
        />
    );
}
