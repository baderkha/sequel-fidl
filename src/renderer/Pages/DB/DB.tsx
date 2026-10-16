import React from 'react';
import { useAtom } from 'jotai';
import {
    Box,
    CircleAlert,
    Columns3,
    Database,
    LayoutGrid,
    LogOut,
    Palette,
    Plug,
    Rows3,
    Zap,
    FolderOpen,
    ChevronRight,
} from 'lucide-react';
import { ConID, SessionState } from 'renderer/State';
import { api, ColSchema, DialectInfoRes, onMainEvent, Table } from 'renderer/api';
import SideNav from './side-nav/SideNav';
import { QueryFile } from './query-file/QueryFile';
import { Content } from './content/Content';
import { Structure } from './structure/Structure';
import {
    TableAction,
    TableActionDialogs,
} from 'renderer/Components/TableActions/TableActionDialogs';
import { Splitter, usePersistentSize } from 'renderer/Components/ui/Splitter';
import { useToast } from 'renderer/Components/ui/Toasts';
import { ThemePicker } from 'renderer/Components/ui/ThemePicker';
import { QuickOpen } from 'renderer/Components/ui/QuickOpen';
import { useTransaction, useTransactionSync } from './useTransaction';
import { TransactionControls, useCommitFlow } from './TransactionBar';
import { dirOf, Doc, TEXT_FILE, useWorksheets, worksheetScope } from './useWorksheets';
import { useExplorer } from './side-nav/Explorer';
import { SaveAsDialog } from './query-file/SaveAsDialog';
import { TerminalHandle, TerminalPanel } from 'renderer/Components/Terminal/TerminalPanel';
import { ExportDialog, ExportTarget } from 'renderer/Components/Export/ExportDialog';
import { BatchExportDialog } from 'renderer/Components/Export/BatchExportDialog';
import type { TerminalProfileId } from 'renderer/api';
import { CreateTableWizard } from 'renderer/Components/CreateTable/CreateTableWizard';
import { SeedDialog } from 'renderer/Components/Seed/SeedDialog';
import { loadTableDef } from 'renderer/Components/CreateTable/loadTable';
import type { Tab as EditorTab, TableDef } from 'renderer/Components/CreateTable/model';
import { useTheme } from 'renderer/theme/ThemeProvider';

type View = 'content' | 'structure' | 'query' | 'project';

const VIEWS: { id: View; label: string; icon: React.ReactNode; kbd: string }[] = [
    { id: 'content', label: 'Content', icon: <Rows3 size={14} />, kbd: '⌘1' },
    { id: 'structure', label: 'Structure', icon: <Columns3 size={14} />, kbd: '⌘2' },
    { id: 'query', label: 'Quick Queries', icon: <Zap size={14} />, kbd: '⌘3' },
    { id: 'project', label: 'Project', icon: <FolderOpen size={14} />, kbd: '⌘4' },
];

const isMac = navigator.platform.toUpperCase().includes('MAC');

export function DBView() {
    const [conID] = useAtom(ConID);
    const [session] = useAtom(SessionState);
    const [lost, setLost] = React.useState('');
    const notify = useToast();
    const { theme } = useTheme();
    const [tables, setTables] = React.useState<Table[]>([]);
    const [dbs, setDbs] = React.useState<string[]>([]);
    const [dialect, setDialect] = React.useState<DialectInfoRes>({});
    const [selectedTable, setSelectedTable] = React.useState('');
    const [view, setView] = React.useState<View>('content');
    const [refreshStamp, setRefreshStamp] = React.useState(Date.now());
    const [loadingTables, setLoadingTables] = React.useState(false);
    const [action, setAction] = React.useState<TableAction | null>(null);
    const [pickingTheme, setPickingTheme] = React.useState(false);
    const [quickOpen, setQuickOpen] = React.useState(false);
    useTransactionSync();
    const { tx } = useTransaction();
    const scope = worksheetScope(session);
    const worksheets = useWorksheets(scope);
    const [saving, setSaving] = React.useState<{ doc: Doc; closeAfter?: boolean; copy?: boolean } | null>(null);
    const label = session?.label || 'Untitled';
    const [exporting, setExporting] = React.useState<ExportTarget | null>(null);
    const [batchExporting, setBatchExporting] = React.useState(false);
    // ---- embedded terminal (⌃`)
    const [terminalOpen, setTerminalOpen] = React.useState(false);
    const [terminalH, setTerminalH] = usePersistentSize('sequel-fidl.terminal-h', 240);
    const terminalRef = React.useRef<TerminalHandle>(null);
    const toggleTerminal = () =>
        setTerminalOpen((o) => {
            if (o) return false;
            window.setTimeout(() => terminalRef.current?.focus(), 50);
            return true;
        });
    const openTerminalAt = (dir: string) => {
        setTerminalOpen(true);
        terminalRef.current?.cd(dir);
    };
    /** new terminal tab , the panel's default kind when none is given */
    const newTerminal = (profile?: TerminalProfileId) => {
        setTerminalOpen(true);
        terminalRef.current?.open(profile);
    };
    React.useEffect(() => {
        // ⌃` toggles , ⌃⇧` opens another (the menu has them too , this covers focus inside monaco / xterm)
        const onKey = (ev: KeyboardEvent) => {
            if (ev.ctrlKey && !ev.metaKey && ev.code === 'Backquote') {
                ev.preventDefault();
                ev.stopPropagation();
                if (ev.shiftKey) newTerminal();
                else toggleTerminal();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, []);
    const reportErr = (err: Error | null) => {
        if (err) notify(err.message, 'error');
    };
    /** ⌘N : a new file in the project (connecting a folder first when there is none) */
    const openNewSheet = async () => {
        setView('project');
        if (await worksheets.ensureFolder(label)) reportErr(await worksheets.newFile());
    };
    /** quick query → a copy saved as a project file (connecting a folder first) , file → a copy */
    const saveDoc = async (doc: Doc) => {
        if (!doc.quick) {
            setSaving({ doc, copy: true });
            return;
        }
        worksheets.flush(doc.id);
        if (await worksheets.ensureFolder(label)) setSaving({ doc });
    };
    // ⌘N / ⌘S / ⇧⌘S come from the app menu
    React.useEffect(() => {
        const offs = [
            onMainEvent('menu_new_worksheet', openNewSheet),
            // everything autosaves , ⌘S writes it now
            onMainEvent('menu_save', () => {
                const doc = view === 'query' ? worksheets.quick : worksheets.active;
                if (!doc) return;
                worksheets.flush(doc.id);
                notify(`Saved ${doc.name}`, 'success');
            }),
            onMainEvent('menu_save_as', () => {
                const doc = view === 'query' ? worksheets.quick : worksheets.active;
                if (doc) saveDoc(doc);
            }),
            onMainEvent('menu_open_folder', () => worksheets.chooseFolder(label).then(reportErr)),
            onMainEvent('menu_toggle_terminal', toggleTerminal),
            onMainEvent('menu_new_terminal', () => newTerminal()),
            onMainEvent('menu_new_mysql_terminal', () => newTerminal('mysql')),
        ];
        return () => offs.forEach((off) => off && off());
    });
    const explorer = useExplorer({
        ws: worksheets,
        scope,
        label,
        onShowEditor: () => setView('project'),
        onOpenTerminal: openTerminalAt,
    });
    const [recent, setRecent] = React.useState<string[]>([]);
    const [creatingTable, setCreatingTable] = React.useState(false);
    const [seeding, setSeeding] = React.useState('');
    const [editing, setEditing] = React.useState<{
        original: TableDef;
        tab: EditorTab;
        add?: 'column' | 'index' | 'foreignKey';
    } | null>(null);

    // always edit the structure as it is on the server right now
    const editStructure = (tab: EditorTab, add?: 'column' | 'index' | 'foreignKey') =>
        loadTableDef((sql) => api.rows(conID, sql), selectedTable)
            .then((original) => setEditing({ original, tab, add }))
            .catch((err) => notify(err.message || `${err}`, 'error'));
    const [sidebarW, setSidebarW] = usePersistentSize('sequel-fidl.sidebar-w', 248);

    // schemas are cached until the next refresh , shared by content , structure and completion
    const schemaCache = React.useRef(new Map<string, Promise<ColSchema[]>>());
    const getSchema = React.useCallback(
        (table: string) => {
            if (!schemaCache.current.has(table)) {
                schemaCache.current.set(table, api.schema(conID, table));
            }
            return schemaCache.current.get(table);
        },
        [conID, refreshStamp]
    );

    const loadAll = React.useCallback(() => {
        if (!conID) {
            return;
        }
        schemaCache.current.clear();
        setLoadingTables(true);
        api.listDatabases(conID).then((d) => setDbs(d || []));
        api.dialectInfo(conID).then((d) => setDialect(d || {}));
        api.listTables(conID).then((t) => {
            const list = t || [];
            setTables(list);
            setLoadingTables(false);
            setSelectedTable((cur) =>
                list.some((x) => x.Name === cur) ? cur : list[0]?.Name || ''
            );
        });
    }, [conID]);

    const refresh = React.useCallback(() => {
        loadAll();
        setRefreshStamp(Date.now());
    }, [loadAll]);

    React.useEffect(loadAll, [loadAll]);

    const flow = useCommitFlow(conID, refresh);

    // most recently opened tables first , for ⌘P
    React.useEffect(() => {
        if (selectedTable) {
            setRecent((r) => [selectedTable, ...r.filter((t) => t !== selectedTable)].slice(0, 8));
        }
    }, [selectedTable]);

    // ⌘P quick open , capture phase so it wins over the sql editor
    React.useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'p') {
                ev.preventDefault();
                ev.stopPropagation();
                setQuickOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, []);

    // keyboard shortcuts
    React.useEffect(() => {
        let chord = false;
        const onKey = (ev: KeyboardEvent) => {
            const mod = ev.metaKey || ev.ctrlKey;
            if (chord) {
                chord = false;
                if (mod && ev.key.toLowerCase() === 't') {
                    ev.preventDefault();
                    setPickingTheme(true);
                    return;
                }
            }
            if (!mod || ev.shiftKey || ev.altKey) {
                return;
            }
            if (ev.key === '1' || ev.key === '2' || ev.key === '3' || ev.key === '4') {
                ev.preventDefault();
                setView(VIEWS[+ev.key - 1].id);
            } else if (ev.key.toLowerCase() === 'k') {
                // vscode style cmd+k cmd+t
                chord = true;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const result = (err: Error | null, ok: string) => {
        if (err) {
            notify(err.message || `${err}`, 'error');
            return false;
        }
        notify(ok, 'success');
        setAction(null);
        refresh();
        return true;
    };

    const switchDatabase = (db: string) =>
        api.switchDatabase(conID, db).then((err) => {
            if (err) {
                notify(err.message || `${err}`, 'error');
                return;
            }
            setSelectedTable('');
            refresh();
        });

    const copyCreate = (table: string) =>
        api
            .createSQL(conID, table)
            .then((sql) => navigator.clipboard.writeText(`${sql};`))
            .then(() => notify(`Copied CREATE statement for ${table}`, 'success'));

    // the window is the session : closing it disconnects (and stops an unused playground)
    const disconnect = () => window.close();

    // the server went away (health check failed) or the playground was stopped elsewhere
    React.useEffect(() => {
        const onGone =
            (fallback: string) => (ev: { conID: string; reason?: string }) => {
                if (ev.conID === conID) {
                    setLost(ev.reason || fallback);
                }
            };
        const offLost = onMainEvent('connection_lost', onGone('Lost the connection to the server'));
        const offClosed = onMainEvent('connection_closed', onGone('Connection closed'));
        return () => {
            offLost && offLost();
            offClosed && offClosed();
        };
    }, [conID]);

    React.useEffect(() => {
        document.title = [session?.label, dialect.DatabaseName, 'Sequel Fidl']
            .filter(Boolean)
            .join(' — ');
    }, [session?.label, dialect.DatabaseName]);

    const tableNames = React.useMemo(() => tables.map((t) => t.Name), [tables]);
    const dialectLabel = dialect.Dialect
        ? `${dialect.Dialect === 'mysql' ? 'MySQL' : dialect.Dialect} ${
              dialect.Version || ''
          }`
        : 'Connecting…';

    return (
        <div className="app">
            <header className={`titlebar ${isMac ? 'is-mac' : ''}`}>
                <div className="titlebar-left">
                    <TransactionControls flow={flow} />
                </div>
                <div className="titlebar-center">
                    <div className="conn-pill">
                        <span className="conn-dot" />
                        {session?.kind === 'playground' ? <Box size={12} /> : <Plug size={12} />}
                        <strong>{session?.label}</strong>
                        <span className="conn-sep">·</span>
                        {dialectLabel}
                        {dialect.DatabaseName && (
                            <>
                                <span className="conn-sep">·</span>
                                {dialect.DatabaseName}
                            </>
                        )}
                    </div>
                </div>
                <div className="titlebar-right">
                    <button
                        type="button"
                        className="icon-btn"
                        title="Connections (⌘⇧N)"
                        onClick={() => api.showLauncher()}
                    >
                        <LayoutGrid size={15} />
                    </button>
                    <button
                        type="button"
                        className="btn is-ghost"
                        title={
                            session?.kind === 'playground'
                                ? 'Close this window , the playground stops when no window uses it'
                                : 'Close this connection window'
                        }
                        onClick={disconnect}
                    >
                        <LogOut size={13} /> Disconnect
                    </button>
                    <button
                        type="button"
                        className="icon-btn"
                        title="Color theme (⌘K ⌘T)"
                        onClick={() => setPickingTheme(true)}
                    >
                        <Palette size={15} />
                    </button>
                </div>
            </header>

            <div className="workbench">
                <SideNav
                    width={sidebarW}
                    tables={tables}
                    selectedTable={selectedTable}
                    databases={dbs}
                    currentDatabase={dialect.DatabaseName || ''}
                    loading={loadingTables}
                    onTableSelected={(t) => {
                        setSelectedTable(t);
                        if (view === 'query' || view === 'project') {
                            setView('content');
                        }
                    }}
                    onDatabaseChange={switchDatabase}
                    onRefresh={refresh}
                    onCopyCreate={copyCreate}
                    onTableAction={setAction}
                    onNewTable={() => setCreatingTable(true)}
                    explorer={explorer}
                    onSeed={setSeeding}
                    onExport={(table) => setExporting({ source: { kind: 'table', table }, name: table })}
                    onExportMany={() => setBatchExporting(true)}
                />
                <Splitter
                    direction="vertical"
                    size={sidebarW}
                    min={180}
                    max={520}
                    onChange={setSidebarW}
                />
                <main className="app-main">
                    <nav className="tabbar">
                        {VIEWS.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                className={`tab ${view === v.id ? 'is-active' : ''}`}
                                onClick={() => setView(v.id)}
                                title={`${v.label} (${v.kbd})`}
                            >
                                {v.icon}
                                {v.label}
                            </button>
                        ))}
                        <div className="tabbar-spacer" />
                        {(view === 'content' || view === 'structure') && selectedTable && (
                            <div className="breadcrumb">
                                <Database size={12} />
                                {dialect.DatabaseName}
                                <ChevronRight size={12} />
                                <strong>{selectedTable}</strong>
                            </div>
                        )}
                    </nav>
                    {view === 'query' || view === 'project' ? (
                        <QueryFile
                            key={view}
                            mode={view === 'query' ? 'quick' : 'project'}
                            tables={tables}
                            getSchema={getSchema}
                            onMutation={refresh}
                            flow={flow}
                            worksheets={worksheets}
                            label={label}
                            onNewWorksheet={openNewSheet}
                            onSaveDoc={saveDoc}
                            onExport={(sql) => setExporting({ source: { kind: 'query', sql }, name: 'query' })}
                        />
                    ) : !selectedTable ? (
                        <div className="result-message">
                            {loadingTables ? 'Loading…' : 'Select a table'}
                        </div>
                    ) : view === 'content' ? (
                        <Content
                            TableName={selectedTable}
                            refreshStamp={refreshStamp}
                            getSchema={getSchema}
                            isView={tables.find((t) => t.Name === selectedTable)?.Type === 'view'}
                            onSeed={
                                tables.find((t) => t.Name === selectedTable)?.Type === 'view'
                                    ? undefined
                                    : () => setSeeding(selectedTable)
                            }
                            onExport={(source, detail) => setExporting({ source, name: selectedTable, detail })}
                        />
                    ) : (
                        <Structure
                            TableName={selectedTable}
                            refreshStamp={refreshStamp}
                            isView={tables.find((t) => t.Name === selectedTable)?.Type === 'view'}
                            onEdit={editStructure}
                        />
                    )}
                    {terminalOpen && (
                        <Splitter direction="horizontal" size={terminalH} min={90} max={900} reverse onChange={setTerminalH} />
                    )}
                    {/* stays mounted while hidden , so its terminals keep running */}
                    <div
                        style={{
                            height: terminalH,
                            display: terminalOpen ? 'flex' : 'none',
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        <TerminalPanel
                            ref={terminalRef}
                            visible={terminalOpen}
                            cwd={worksheets.folder || null}
                            conID={conID || null}
                            connectionLabel={label}
                            onClose={() => setTerminalOpen(false)}
                        />
                    </div>
                </main>
            </div>

            <footer className="statusbar">
                <span className="status-item">
                    <span className="conn-dot" />
                    {dialectLabel}
                </span>
                <span className="status-item">
                    <Database size={12} />
                    {dialect.DatabaseName || '—'}
                </span>
                <span className="status-item">
                    {tables.length} table{tables.length === 1 ? '' : 's'}
                </span>
                <div className="toolbar-spacer" />
                {tx.open && (
                    <button
                        type="button"
                        className="status-item is-tx"
                        title="Commit or roll back in the Query tab"
                        onClick={() => setView('query')}
                    >
                        <span className="tx-dot" />
                        Uncommitted transaction
                    </button>
                )}
                <button
                    type="button"
                    className="status-item"
                    onClick={() => setPickingTheme(true)}
                    title="Color theme (⌘K ⌘T)"
                >
                    <Palette size={12} />
                    {theme.name}
                </button>
            </footer>

            <TableActionDialogs
                action={action}
                onClose={() => setAction(null)}
                onClone={(t, name, copyData) =>
                    api
                        .cloneTable(conID, t, name, copyData)
                        .then((err) => result(err, `Duplicated ${t} as ${name}`))
                }
                onRename={(t, name) =>
                    api.renameTable(conID, t, name).then((err) => {
                        if (result(err, `Renamed ${t} to ${name}`)) {
                            setSelectedTable((cur) => (cur === t ? name : cur));
                        }
                    })
                }
                onTruncate={(t) =>
                    api.truncateTable(conID, t).then((err) => result(err, `Truncated ${t}`))
                }
                onDrop={(t) =>
                    api.dropTable(conID, t).then((err) => result(err, `Dropped ${t}`))
                }
            />
            {pickingTheme && <ThemePicker onClose={() => setPickingTheme(false)} />}
            {quickOpen && (
                <QuickOpen
                    tables={tables}
                    files={worksheets.files}
                    recent={recent.filter((t) => t !== selectedTable)}
                    onClose={() => setQuickOpen(false)}
                    onPick={(name, target) => {
                        setQuickOpen(false);
                        setSelectedTable(name);
                        setView(target);
                    }}
                    onPickFile={(rel) => {
                        setQuickOpen(false);
                        worksheets.openFile(rel).then((err) => {
                            reportErr(err);
                            if (!err && TEXT_FILE.test(rel)) setView('project');
                        });
                    }}
                />
            )}
            {flow.reviewElement}
            {saving && (
                <SaveAsDialog
                    ws={worksheets}
                    title={saving.copy ? `Save a copy of ${saving.doc.name}` : `Save ${saving.doc.name} to the project`}
                    initialName={
                        saving.copy
                            ? saving.doc.name.replace(/(\.[^.]+)?$/, ' copy$1')
                            : saving.doc.quick
                            ? `${saving.doc.name.replace(/[\\/:]/g, '-')}.sql`
                            : saving.doc.name
                    }
                    initialDir={saving.doc.rel ? dirOf(saving.doc.rel) : ''}
                    onClose={() => setSaving(null)}
                    onSave={async (name, dir) => {
                        const { doc, copy, closeAfter } = saving;
                        // the quick query stays , the project gets a copy of it (opened in Project)
                        const err = await worksheets.createFile(dir, name, doc.sql, copy || doc.quick ? {} : { replace: doc.id, closeAfter });
                        if (!err) {
                            setSaving(null);
                            if (doc.quick) setView('project');
                            notify(`Saved ${name}`, 'success');
                        }
                        return err;
                    }}
                />
            )}
            {lost && (
                <div className="backdrop is-flush">
                    <div className="modal">
                        <div className="modal-header">
                            <CircleAlert size={16} style={{ color: 'var(--danger)' }} />
                            Disconnected
                        </div>
                        <div className="modal-body">
                            {lost}. Reopen it from the connection manager.
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn is-ghost"
                                onClick={() => api.showLauncher()}
                            >
                                Connections
                            </button>
                            <button
                                type="button"
                                className="btn is-primary"
                                autoFocus
                                onClick={() => window.close()}
                            >
                                Close Window
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {editing && (
                <CreateTableWizard
                    conID={conID}
                    tables={tableNames}
                    getSchema={getSchema}
                    edit={editing}
                    onClose={() => setEditing(null)}
                    onCreated={(name) => {
                        setEditing(null);
                        notify(`Updated the structure of ${name}`, 'success');
                        refresh();
                        setSelectedTable(name);
                    }}
                />
            )}
            {batchExporting && (
                <BatchExportDialog
                    conID={conID}
                    tables={tables}
                    database={dialect.DatabaseName || ''}
                    defaultDir={worksheets.folder || null}
                    onClose={() => setBatchExporting(false)}
                />
            )}
            {exporting && (
                <ExportDialog
                    conID={conID}
                    target={exporting}
                    defaultDir={worksheets.folder || null}
                    onClose={() => setExporting(null)}
                />
            )}
            {seeding && (
                <SeedDialog
                    conID={conID}
                    table={seeding}
                    tables={tableNames}
                    getSchema={getSchema}
                    onClose={() => setSeeding('')}
                    onInserted={(n) => {
                        notify(`Inserted ${n.toLocaleString()} rows into ${seeding}`, 'success');
                        setRefreshStamp(Date.now());
                    }}
                />
            )}
            {creatingTable && (
                <CreateTableWizard
                    conID={conID}
                    tables={tableNames}
                    getSchema={getSchema}
                    onClose={() => setCreatingTable(false)}
                    onCreated={(name) => {
                        setCreatingTable(false);
                        notify(`Created table ${name}`, 'success');
                        refresh();
                        setSelectedTable(name);
                        setView('structure');
                    }}
                />
            )}
        </div>
    );
}
