import React from 'react';

const read = (key: string, fallback: number) => {
    try {
        const val = parseFloat(localStorage.getItem(key));
        return Number.isFinite(val) ? val : fallback;
    } catch (e) {
        return fallback;
    }
};

/**
 * A size (px) that survives reloads
 * @param key storage key
 * @param initial default size
 */
export function usePersistentSize(key: string, initial: number) {
    const [size, setSize] = React.useState(() => read(key, initial));
    React.useEffect(() => {
        try {
            localStorage.setItem(key, `${size}`);
        } catch (e) {}
    }, [key, size]);
    return [size, setSize] as const;
}

export type SplitterProps = {
    direction: 'vertical' | 'horizontal';
    size: number;
    min: number;
    max: number;
    onChange: (size: number) => void;
    /** the resized pane is after the splitter (size grows when dragging up / left) */
    reverse?: boolean;
};

/**
 * Drag handle between two panes ,
 * vertical = side by side panes (drag left / right) , horizontal = stacked panes
 */
export function Splitter(p: SplitterProps) {
    const [dragging, setDragging] = React.useState(false);

    const onMouseDown = (ev: React.MouseEvent) => {
        ev.preventDefault();
        const start = p.direction === 'vertical' ? ev.clientX : ev.clientY;
        const startSize = p.size;
        setDragging(true);
        document.body.classList.add('is-resizing');
        document.body.style.cursor =
            p.direction === 'vertical' ? 'col-resize' : 'row-resize';

        const onMove = (e: MouseEvent) => {
            const pos = p.direction === 'vertical' ? e.clientX : e.clientY;
            const delta = (pos - start) * (p.reverse ? -1 : 1);
            p.onChange(Math.min(p.max, Math.max(p.min, startSize + delta)));
        };
        const onUp = () => {
            setDragging(false);
            document.body.classList.remove('is-resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div
            className={`splitter is-${p.direction} ${
                dragging ? 'is-dragging' : ''
            }`}
            onMouseDown={onMouseDown}
        />
    );
}
