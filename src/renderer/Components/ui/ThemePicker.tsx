import React from 'react';
import { Check } from 'lucide-react';
import { ThemePreference, useTheme } from 'renderer/theme/ThemeProvider';
import { AppTheme, darkTheme, lightTheme } from 'renderer/theme/themes';

type Option = { pref: ThemePreference; label: string; swatch: AppTheme[] };

const Swatch = ({ themes }: { themes: AppTheme[] }) => (
    <span className="swatch">
        {themes.map((t) => (
            <React.Fragment key={t.id}>
                <span style={{ background: t.colors.surface }} />
                <span style={{ background: t.colors.accent }} />
            </React.Fragment>
        ))}
    </span>
);

/**
 * VS Code style theme quick pick , arrow keys preview the theme live
 */
export function ThemePicker({ onClose }: { onClose: () => void }) {
    const { themes, preference, setPreference, preview } = useTheme();
    const [query, setQuery] = React.useState('');

    const options: Option[] = React.useMemo(
        () => [
            {
                pref: 'system',
                label: 'System',
                swatch: [darkTheme, lightTheme],
            },
            ...themes.map((t) => ({ pref: t.id, label: t.name, swatch: [t] })),
        ],
        [themes]
    );
    const visible = options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
    );
    const [active, setActive] = React.useState(() =>
        Math.max(
            0,
            options.findIndex((o) => o.pref === preference)
        )
    );
    const current = visible[Math.min(active, visible.length - 1)];

    React.useEffect(() => {
        preview(current ? current.pref : null);
    }, [current?.pref]);

    const cancel = () => {
        preview(null);
        onClose();
    };
    const pick = (opt: Option) => {
        setPreference(opt.pref);
        onClose();
    };

    const onKeyDown = (ev: React.KeyboardEvent) => {
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            setActive((a) => (a + 1) % Math.max(1, visible.length));
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            setActive(
                (a) => (a - 1 + visible.length) % Math.max(1, visible.length)
            );
        } else if (ev.key === 'Enter' && current) {
            pick(current);
        } else if (ev.key === 'Escape') {
            ev.stopPropagation();
            cancel();
        }
    };

    return (
        <div className="backdrop" onMouseDown={cancel}>
            <div className="quickpick" onMouseDown={(ev) => ev.stopPropagation()}>
                <input
                    className="quickpick-input"
                    autoFocus
                    placeholder="Select color theme (Up/Down to preview)"
                    value={query}
                    onChange={(ev) => {
                        setQuery(ev.target.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                />
                <div className="quickpick-list">
                    {visible.map((opt, idx) => (
                        <div
                            key={opt.pref}
                            className={`quickpick-item ${
                                opt === current ? 'is-active' : ''
                            }`}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => pick(opt)}
                        >
                            <Swatch themes={opt.swatch} />
                            {opt.label}
                            {opt.pref === preference && (
                                <span className="hint">
                                    <Check size={14} />
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
