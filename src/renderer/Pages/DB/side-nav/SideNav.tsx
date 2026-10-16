import React from 'react';
import { search } from 'fast-fuzzy';
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Database,
    Download,
    Eraser,
    Eye,
    Files,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Table2,
    Trash2,
} from 'lucide-react';
import type { Table } from 'renderer/api';
import { ContextMenu, useContextMenu } from 'renderer/Components/ui/ContextMenu';
import type { TableAction } from 'renderer/Components/TableActions/TableActionDialogs';

export type SideNavProps = {
    width: number;
    tables: Table[];
    selectedTable: string;
    databases: string[];
    currentDatabase: string;
    loading?: boolean;
    onTableSelected: (tableName: string) => void;
    onDatabaseChange: (db: string) => void;
    onRefresh: () => void;
    onCopyCreate: (tableName: string) => void;
    onTableAction: (action: TableAction) => void;
    onNewTable: () => void;
    onSeed: (tableName: string) => void;
    onExport: (tableName: string) => void;
    /** several tables at once */
    onExportMany: () => void;
    /** the project explorer section (header actions + tree) */
    explorer?: { title?: string; actions: React.ReactNode; body: React.ReactNode };
};

type SectionId = 'tables' | 'explorer';
const SECTIONS_KEY = 'sequel-fidl.sidebar.collapsed';

export default function SideNav(p: SideNavProps) {
    const [query, setQuery] = React.useState('');
    const [menuTable, setMenuTable] = React.useState('');
    const menu = useContextMenu();
    const searchRef = React.useRef<HTMLInputElement>(null);
    const [collapsed, setCollapsed] = React.useState<Record<SectionId, boolean>>(() => {
        try {
            return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
        } catch (e) {
            return {} as Record<SectionId, boolean>;
        }
    });
    const toggle = (id: SectionId) =>
        setCollapsed((c) => {
            const next = { ...c, [id]: !c[id] };
            try {
                localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
            } catch (e) {}
            return next;
        });

    const visible = React.useMemo(() => {
        const sorted = [...(p.tables || [])].sort((a, b) =>
            a.Name.localeCompare(b.Name)
        );
        return query
            ? search(query, sorted, { keySelector: (t) => t.Name })
            : sorted;
    }, [p.tables, query]);


    const openMenu = (ev: React.MouseEvent, t: Table) => {
        setMenuTable(t.Name);
        const isView = t.Type === 'view';
        menu.open(ev, [
            {
                label: 'Copy CREATE Statement',
                icon: <Copy size={14} />,
                onSelect: () => p.onCopyCreate(t.Name),
            },
            {
                label: 'New Table…',
                icon: <Plus size={14} />,
                onSelect: p.onNewTable,
            },
            {
                label: 'Seed with Fake Data…',
                icon: <Sparkles size={14} />,
                disabled: isView,
                onSelect: () => p.onSeed(t.Name),
            },
            {
                label: 'Export…',
                icon: <Download size={14} />,
                onSelect: () => p.onExport(t.Name),
            },
            'separator',
            {
                label: 'Duplicate…',
                icon: <Files size={14} />,
                disabled: isView,
                onSelect: () => p.onTableAction({ kind: 'clone', table: t.Name }),
            },
            {
                label: 'Rename…',
                icon: <Pencil size={14} />,
                onSelect: () => p.onTableAction({ kind: 'rename', table: t.Name }),
            },
            'separator',
            {
                label: 'Truncate…',
                icon: <Eraser size={14} />,
                danger: true,
                disabled: isView,
                onSelect: () =>
                    p.onTableAction({ kind: 'truncate', table: t.Name }),
            },
            {
                label: 'Drop Table…',
                icon: <Trash2 size={14} />,
                danger: true,
                disabled: isView,
                onSelect: () => p.onTableAction({ kind: 'drop', table: t.Name }),
            },
        ]);
    };

    // right click on the empty part of the list
    const openListMenu = (ev: React.MouseEvent) => {
        setMenuTable('');
        menu.open(ev, [
            {
                label: 'New Table…',
                icon: <Plus size={14} />,
                onSelect: p.onNewTable,
            },
            {
                label: 'Export Tables…',
                icon: <Download size={14} />,
                disabled: !p.tables.length,
                onSelect: p.onExportMany,
            },
            {
                label: 'Refresh',
                icon: <RefreshCw size={14} />,
                onSelect: p.onRefresh,
            },
        ]);
    };

    const onSearchKey = (ev: React.KeyboardEvent) => {
        if (ev.key === 'Enter' && visible.length) {
            p.onTableSelected(visible[0].Name);
        } else if (ev.key === 'Escape') {
            setQuery('');
        }
    };

    return (
        <aside className="sidebar" style={{ width: p.width }}>
            <div className="sidebar-section">
                <div className="input-with-icon">
                    <Database size={13} />
                    <select
                        className="select app-input"
                        style={{ paddingLeft: 28, width: '100%' }}
                        value={p.currentDatabase}
                        onChange={(ev) => p.onDatabaseChange(ev.target.value)}
                        title="Database"
                    >
                        {!p.databases.includes(p.currentDatabase) && (
                            <option value={p.currentDatabase}>
                                {p.currentDatabase || 'Select database'}
                            </option>
                        )}
                        {p.databases.map((db) => (
                            <option key={db} value={db}>
                                {db}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="input-with-icon">
                    <Search size={13} />
                    <input
                        ref={searchRef}
                        className="app-input"
                        placeholder="Filter tables"
                        value={query}
                        onChange={(ev) => setQuery(ev.target.value)}
                        onKeyDown={onSearchKey}
                    />
                </div>
            </div>
            <div className={`sidebar-pane ${collapsed.tables ? 'is-collapsed' : ''}`}>
            <div className="sidebar-label is-toggle" onClick={() => toggle('tables')}>
                <span>
                    {collapsed.tables ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    Tables
                    <span className="count">{p.tables.length}</span>
                </span>
                <span className="sidebar-actions" onClick={(ev) => ev.stopPropagation()}>
                    <button
                        type="button"
                        className="icon-btn is-small"
                        title="Export tables…"
                        disabled={!p.tables.length}
                        onClick={p.onExportMany}
                    >
                        <Download size={13} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn is-small"
                        title="New table"
                        onClick={p.onNewTable}
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn is-small"
                        title="Refresh"
                        onClick={p.onRefresh}
                    >
                        <RefreshCw size={13} className={p.loading ? 'spin' : ''} />
                    </button>
                </span>
            </div>
            <div className="table-list" onContextMenu={openListMenu}>
                {visible.map((t) => (
                    <div
                        key={t.Name}
                        className={`table-item ${t.Type === 'view' ? 'is-view' : ''} ${
                            t.Name === p.selectedTable ? 'is-active' : ''
                        } ${menu.state && menuTable === t.Name ? 'has-menu' : ''}`}
                        onClick={() => p.onTableSelected(t.Name)}
                        onContextMenu={(ev) => openMenu(ev, t)}
                        title={t.Type === 'view' ? `${t.Name} (view)` : t.Name}
                    >
                        {t.Type === 'view' ? (
                            <Eye size={14} className="table-item-icon" />
                        ) : (
                            <Table2 size={14} className="table-item-icon" />
                        )}
                        <span className="table-item-name">{t.Name}</span>
                    </div>
                ))}
                {!visible.length && (
                    <div className="sidebar-empty">
                        {query ? 'No matching tables' : 'No tables'}
                    </div>
                )}
            </div>
            </div>
            {p.explorer && (
                <div className={`sidebar-pane ${collapsed.explorer ? 'is-collapsed' : ''}`}>
                    <div className="sidebar-label is-toggle" onClick={() => toggle('explorer')}>
                        <span>
                            {collapsed.explorer ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            <span className="explorer-title" title={p.explorer.title}>
                                {p.explorer.title || 'Explorer'}
                            </span>
                        </span>
                        <span onClick={(ev) => ev.stopPropagation()}>{p.explorer.actions}</span>
                    </div>
                    {p.explorer.body}
                </div>
            )}
            <ContextMenu {...menu} />
        </aside>
    );
}
