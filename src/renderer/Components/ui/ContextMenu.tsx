import React from 'react';

export type MenuEntry =
    | {
          label: string;
          icon?: React.ReactNode;
          kbd?: string;
          danger?: boolean;
          disabled?: boolean;
          onSelect: () => void;
      }
    | 'separator';

export type MenuState = { x: number; y: number; items: MenuEntry[] } | null;

/**
 * State holder for a right click menu
 * const menu = useContextMenu() ; onContextMenu={(e) => menu.open(e, items)} ; <ContextMenu {...menu} />
 */
export function useContextMenu() {
    const [state, setState] = React.useState<MenuState>(null);
    const open = React.useCallback(
        (ev: React.MouseEvent, items: MenuEntry[]) => {
            ev.preventDefault();
            ev.stopPropagation();
            setState({ x: ev.clientX, y: ev.clientY, items });
        },
        []
    );
    const close = React.useCallback(() => setState(null), []);
    return { state, open, close };
}

export function ContextMenu({
    state,
    close,
}: {
    state: MenuState;
    close: () => void;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [pos, setPos] = React.useState({ left: 0, top: 0 });

    React.useLayoutEffect(() => {
        if (!state || !ref.current) {
            return;
        }
        // keep the menu inside the window
        const rect = ref.current.getBoundingClientRect();
        setPos({
            left: Math.min(state.x, window.innerWidth - rect.width - 6),
            top: Math.min(state.y, window.innerHeight - rect.height - 6),
        });
    }, [state]);

    React.useEffect(() => {
        if (!state) {
            return undefined;
        }
        const onDown = (ev: MouseEvent) => {
            if (!ref.current?.contains(ev.target as Node)) {
                close();
            }
        };
        const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
        window.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('blur', close);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('blur', close);
            window.removeEventListener('resize', close);
        };
    }, [state, close]);

    if (!state) {
        return null;
    }
    return (
        <div
            ref={ref}
            className="menu"
            style={pos}
            onContextMenu={(ev) => ev.preventDefault()}
        >
            {state.items.map((item, idx) =>
                item === 'separator' ? (
                    <div key={`sep-${idx}`} className="menu-sep" />
                ) : (
                    <button
                        key={item.label}
                        type="button"
                        className={`menu-item ${item.danger ? 'is-danger' : ''}`}
                        disabled={item.disabled}
                        onClick={() => {
                            close();
                            item.onSelect();
                        }}
                    >
                        {item.icon}
                        {item.label}
                        {item.kbd && <span className="kbd">{item.kbd}</span>}
                    </button>
                )
            )}
        </div>
    );
}
