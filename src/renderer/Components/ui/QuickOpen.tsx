import React from 'react';
import { search } from 'fast-fuzzy';
import { Clock, Eye, FileCode2, Search, Table2, Zap } from 'lucide-react';
import type { Table } from 'renderer/api';

export type QuickOpenProps = {
    tables: Table[];
    /** files of the project folder */
    files?: { rel: string; name: string }[];
    /** most recent first */
    recent: string[];
    onPick: (table: string, view: 'content' | 'structure') => void;
    onPickFile?: (rel: string) => void;
    onClose: () => void;
};

/** what the list shows : tables / views and project files */
type Item = { kind: 'table' | 'view' | 'worksheet' | 'quick'; name: string; rel?: string; quickId?: number; hint?: string };
const isTable = (i: Item) => i.kind === 'table' || i.kind === 'view';

const MAX_RESULTS = 50;

/** positions of the query characters in the name (in order , case insensitive) */
const matchPositions = (name: string, query: string): Set<number> => {
    const hits = new Set<number>();
    const lower = name.toLowerCase();
    let from = 0;
    for (const ch of query.toLowerCase().replace(/\s+/g, '')) {
        const at = lower.indexOf(ch, from);
        if (at === -1) {
            return new Set();
        }
        hits.add(at);
        from = at + 1;
    }
    return hits;
};

const Highlight = ({ text, query }: { text: string; query: string }) => {
    const hits = matchPositions(text, query);
    return (
        <span className="qo-name">
            {Array.from(text).map((ch, i) =>
                hits.has(i) ? (
                    // eslint-disable-next-line react/no-array-index-key
                    <mark key={i}>{ch}</mark>
                ) : (
                    ch
                )
            )}
        </span>
    );
};

/**
 * ⌘P : jump to a table , like VS Code's quick open / Spotlight
 */
export function QuickOpen(p: QuickOpenProps) {
    const [query, setQuery] = React.useState('');
    const [active, setActive] = React.useState(0);
    const listRef = React.useRef<HTMLDivElement>(null);

    const items = React.useMemo<Item[]>(
        () => [
            ...p.tables.map((t) => ({ kind: t.Type, name: t.Name } as Item)),
            ...(p.files || []).map(
                (f) =>
                    ({
                        kind: 'worksheet',
                        name: f.name,
                        rel: f.rel,
                        hint: f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '',
                    } as Item)
            ),
        ],
        [p.tables, p.files]
    );

    const results = React.useMemo(() => {
        const q = query.trim();
        if (!q) {
            const recent = p.recent
                .map((name) => items.find((i) => isTable(i) && i.name === name))
                .filter(Boolean);
            const rest = items
                .filter((i) => !(isTable(i) && p.recent.includes(i.name)))
                .sort((a, b) => a.name.localeCompare(b.name));
            return [...recent, ...rest].slice(0, MAX_RESULTS);
        }
        return search(q, items, { keySelector: (i) => i.name, threshold: 0.6 }).slice(0, MAX_RESULTS);
    }, [query, items, p.recent]);

    React.useEffect(() => setActive(0), [query]);
    React.useEffect(() => {
        listRef.current
            ?.querySelector('.quickpick-item.is-active')
            ?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const pick = (i: number, structure: boolean) => {
        const item = results[i];
        if (!item) {
            return;
        }
        if (item.kind === 'worksheet') {
            p.onPickFile && p.onPickFile(item.rel);
        } else {
            p.onPick(item.name, structure ? 'structure' : 'content');
        }
    };

    const onKeyDown = (ev: React.KeyboardEvent) => {
        if (ev.key === 'ArrowDown' || (ev.ctrlKey && ev.key === 'n')) {
            ev.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
        } else if (ev.key === 'ArrowUp' || (ev.ctrlKey && ev.key === 'p')) {
            ev.preventDefault();
            setActive((a) => Math.max(0, a - 1));
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            pick(active, ev.metaKey || ev.ctrlKey);
        } else if (ev.key === 'Escape') {
            ev.stopPropagation();
            p.onClose();
        }
    };

    const showRecent = !query.trim() && p.recent.length > 0;

    return (
        <div className="backdrop" onMouseDown={p.onClose}>
            <div className="quickpick quickopen" onMouseDown={(ev) => ev.stopPropagation()}>
                <div className="quickopen-input">
                    <Search size={15} />
                    <input
                        autoFocus
                        placeholder="Search tables , views and files"
                        value={query}
                        onChange={(ev) => setQuery(ev.target.value)}
                        onKeyDown={onKeyDown}
                        spellCheck={false}
                    />
                </div>
                <div className="quickpick-list" ref={listRef}>
                    {results.map((t, i) => (
                        <div
                            key={`${t.kind}:${t.rel ?? t.quickId ?? t.name}`}
                            className={`quickpick-item ${i === active ? 'is-active' : ''}`}
                            onMouseMove={() => setActive(i)}
                            onClick={(ev) => pick(i, ev.metaKey || ev.ctrlKey)}
                        >
                            {t.kind === 'worksheet' ? (
                                <FileCode2 size={14} />
                            ) : t.kind === 'quick' ? (
                                <Zap size={14} />
                            ) : t.kind === 'view' ? (
                                <Eye size={14} />
                            ) : (
                                <Table2 size={14} />
                            )}
                            <Highlight text={t.name} query={query} />
                            <span className="hint">
                                {showRecent && isTable(t) && p.recent.includes(t.name) ? (
                                    <>
                                        <Clock size={11} /> recent
                                    </>
                                ) : t.kind === 'worksheet' ? (
                                    t.hint ? `${t.hint} /` : 'file'
                                ) : t.kind === 'quick' ? (
                                    'quick query'
                                ) : (
                                    t.kind
                                )}
                            </span>
                        </div>
                    ))}
                    {!results.length && (
                        <div className="quickopen-empty">Nothing matches “{query}”</div>
                    )}
                </div>
                <div className="quickopen-footer">
                    <span>
                        <kbd>↑↓</kbd> navigate
                    </span>
                    <span>
                        <kbd>↵</kbd> open
                    </span>
                    <span>
                        <kbd>⌘↵</kbd> structure
                    </span>
                    <span>
                        <kbd>esc</kbd> close
                    </span>
                </div>
            </div>
        </div>
    );
}
