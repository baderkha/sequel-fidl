import React from 'react';
import { useAtom } from 'jotai';
import {
    CircleAlert,
    CircleCheck,
    Download,
    FolderInput,
    FolderOpen,
    Zap,
    Play,
    SquareTerminal,
    WandSparkles,
} from 'lucide-react';
import { Modal } from 'renderer/Components/ui/Modal';
import type { CommitFlow } from '../TransactionBar';
import type { Doc, Worksheets } from '../useWorksheets';
import { WorksheetTabs } from './WorksheetTabs';
import { ConID } from 'renderer/State';
import { api, ColSchema, Table } from 'renderer/api';
import { DataGrid } from 'renderer/Components/DataGrid/DataGrid';
import { SqlEditor, SqlEditorHandle } from 'renderer/Components/SqlEditor/SqlEditor';
import { Splitter, usePersistentSize } from 'renderer/Components/ui/Splitter';

/** statements that can't change the sidebar / table contents */
const READ_ONLY_STMT = /^\s*(select|show|describe|desc|explain|with)\b/i;

/** typed transaction control statements are routed to the transaction api */
const TX_BEGIN = /^\s*(begin|start\s+transaction)(\s+work)?\s*;?\s*$/i;
const TX_COMMIT = /^\s*commit(\s+work)?\s*;?\s*$/i;
const TX_ROLLBACK = /^\s*rollback(\s+work)?\s*;?\s*$/i;
const IMPLICIT_COMMIT_ERROR = '[implicit-commit]';

type Result =
    | { kind: 'tx'; message: string; ms: number }
    | { kind: 'rows'; rows: any[]; ms: number; statements: number; statement: string }
    | { kind: 'ok'; affected: number; insertId?: number; ms: number; statements: number }
    | { kind: 'error'; message: string; statement: string; index: number; total: number };

export type QueryFileProps = {
    tables: Table[];
    getSchema: (table: string) => Promise<ColSchema[]>;
    /** a statement that may have changed tables / data ran */
    onMutation?: () => void;
    /** window wide transaction (begin / commit review / rollback) */
    flow: CommitFlow;
    worksheets: Worksheets;
    /** quick : the connection's quick query (one virtual file) , project : the files of the project folder */
    mode: 'quick' | 'project';
    /** connection label , names the default project folder */
    label: string;
    onNewWorksheet: () => void;
    onSaveDoc: (doc: Doc, closeAfter?: boolean) => void;
    /** export every row of a statement (it runs again , streamed to a file) */
    onExport: (sql: string) => void;
};

export const QueryFile = (q: QueryFileProps) => {
    const [conID] = useAtom(ConID);
    const editorRef = React.useRef<SqlEditorHandle>(null);
    const sheet = q.mode === 'quick' ? q.worksheets.quick : q.worksheets.active;
    const sheetId = sheet?.id ?? '';
    const [running, setRunning] = React.useState(false);
    // results are kept per worksheet , switching tabs brings them back
    const [results, setResults] = React.useState<Record<string, Result>>({});
    const result = results[sheetId] || null;
    const resultSetter = (id: string) => (r: Result | null) =>
        setResults((m) => ({ ...m, [id]: r }));
    const [editorHeight, setEditorHeight] = usePersistentSize('sequel-fidl.editor-h', 300);
    const txn = q.flow.txn;
    const [implicit, setImplicit] = React.useState<{
        statement: string;
        resolve: (ok: boolean) => void;
    } | null>(null);
    const confirmImplicit = (statement: string) =>
        new Promise<boolean>((resolve) => setImplicit({ statement, resolve }));
    // commit always goes through the window's review
    const { requestCommit } = q.flow;

    const completion = React.useMemo(
        () => ({
            tables: q.tables.map((t) => ({ name: t.Name, type: t.Type })),
            getColumns: (table: string) =>
                q.getSchema(table).then((s) =>
                    (s || []).map((c) => ({ name: c.FieldName, type: c.Type, pk: c.IsPrimaryKey }))
                ),
        }),
        [q.tables, q.getSchema]
    );

    const run = async (statements: string[]) => {
        if (!statements.length || running) {
            return;
        }
        // results land on the worksheet the run started from
        const setResult = resultSetter(sheetId);
        setRunning(true);
        const started = performance.now();
        let last: any = null;
        let lastStatement = '';
        let txMessage = '';
        let mutated = false;
        // the atom only updates after a render , track the transaction while the script runs
        let inTx = txn.tx.open;
        const fail = (message: string, i: number) => {
            setResult({ kind: 'error', message, statement: statements[i], index: i, total: statements.length });
            setRunning(false);
            mutated && q.onMutation && q.onMutation();
        };
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            // BEGIN / COMMIT / ROLLBACK typed in the editor drive the pinned transaction
            if (TX_BEGIN.test(stmt) || TX_COMMIT.test(stmt) || TX_ROLLBACK.test(stmt)) {
                const begin = TX_BEGIN.test(stmt);
                if (TX_COMMIT.test(stmt)) {
                    if (!inTx) {
                        fail('No transaction is open', i);
                        return;
                    }
                    // eslint-disable-next-line no-await-in-loop
                    const decision = await requestCommit();
                    if (decision === 'cancel') {
                        fail('Commit cancelled , the transaction is still open.', i);
                        return;
                    }
                    txMessage = decision === 'commit' ? 'Committed' : 'Rolled back';
                    mutated = true;
                    inTx = false;
                    continue;
                }
                // eslint-disable-next-line no-await-in-loop
                const ok = begin ? await txn.begin() : await txn.rollback();
                if (!ok) {
                    fail(begin ? 'Could not start a transaction' : 'No transaction is open', i);
                    return;
                }
                txMessage = begin ? 'Transaction started' : 'Rolled back';
                inTx = begin;
                last = null;
                mutated = mutated || !begin;
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            let [data, err] = await api.runQuery(conID, stmt);
            if (err && err.message.includes(IMPLICIT_COMMIT_ERROR)) {
                // eslint-disable-next-line no-await-in-loop
                if (!(await confirmImplicit(stmt))) {
                    fail('Not run , the transaction is still open.', i);
                    return;
                }
                // eslint-disable-next-line no-await-in-loop
                [data, err] = await api.runQuery(conID, stmt, { commitFirst: true });
                txn.markClosed();
                inTx = false;
            }
            txMessage = '';
            mutated = mutated || !READ_ONLY_STMT.test(stmt);
            if (err) {
                setResult({
                    kind: 'error',
                    message: err.message,
                    statement: statements[i],
                    index: i,
                    total: statements.length,
                });
                setRunning(false);
                mutated && q.onMutation && q.onMutation();
                return;
            }
            last = data;
            lastStatement = stmt;
        }
        const ms = Math.round(performance.now() - started);
        if (txMessage) {
            setResult({ kind: 'tx', message: txMessage, ms });
        } else if (Array.isArray(last)) {
            setResult({ kind: 'rows', rows: last, ms, statements: statements.length, statement: lastStatement });
        } else {
            setResult({
                kind: 'ok',
                affected: last?.affectedRows ?? 0,
                insertId: last?.insertId || undefined,
                ms,
                statements: statements.length,
            });
        }
        setRunning(false);
        mutated && q.onMutation && q.onMutation();
    };

    const runCurrent = () => {
        const stmt = editorRef.current?.currentStatement();
        run(stmt ? [stmt] : []);
    };
    const runAll = () => run(editorRef.current?.allStatements() || []);

    const rows = result?.kind === 'rows' ? result.rows : [];
    const columns = React.useMemo(
        () => (rows.length ? Object.keys(rows[0]).map((key) => ({ key })) : []),
        [rows]
    );

    const status = () => {
        if (running) {
            return <span className="toolbar-text">Running…</span>;
        }
        if (!result) {
            return null;
        }
        if (result.kind === 'tx') {
            return (
                <span className="toolbar-text">
                    <CircleCheck size={13} className="status-ok" style={{ verticalAlign: -2 }} />{' '}
                    {result.message}
                </span>
            );
        }
        if (result.kind === 'error') {
            return (
                <span className="toolbar-text status-err">
                    <CircleAlert size={13} style={{ verticalAlign: -2 }} /> Error
                    {result.total > 1 ? ` in statement ${result.index + 1} of ${result.total}` : ''}
                </span>
            );
        }
        const what =
            result.kind === 'rows'
                ? `${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? '' : 's'}`
                : `${result.affected.toLocaleString()} affected`;
        return (
            <span className="toolbar-text">
                <CircleCheck size={13} className="status-ok" style={{ verticalAlign: -2 }} />{' '}
                {what}
                {result.statements > 1 ? ` · ${result.statements} statements` : ''} ·{' '}
                {result.ms} ms
            </span>
        );
    };

    if (!q.worksheets.loaded) {
        return <div className="result-message">Loading…</div>;
    }

    if (q.mode === 'project' && !q.worksheets.folder) {
        return <ProjectFolderPicker ws={q.worksheets} label={q.label} />;
    }

    return (
        <div className="view">
            {q.mode === 'quick' ? (
                <div className="quick-bar">
                    <Zap size={13} className="quick-bar-icon" />
                    <strong>Quick query</strong>
                    <span className="toolbar-text">saved with this connection , not a file</span>
                    {sheet && q.worksheets.isDirty(sheet) && <span className="sheet-tab-dirty" title="Saving…" />}
                    <div className="toolbar-spacer" />
                    <button
                        type="button"
                        className="btn is-ghost"
                        disabled={!sheet}
                        title="Save a copy as a file of the project (⇧⌘S)"
                        onClick={() => sheet && q.onSaveDoc(sheet)}
                    >
                        <FolderInput size={13} /> Save to Project…
                    </button>
                </div>
            ) : (
                <WorksheetTabs ws={q.worksheets} onNew={q.onNewWorksheet} onSave={q.onSaveDoc} />
            )}
            <div className="results" style={{ height: editorHeight, flexShrink: 0 }}>
                {sheet ? (
                    <SqlEditor
                        // a fresh editor (and undo history) per worksheet
                        key={sheet.id}
                        ref={editorRef}
                        value={sheet.sql}
                        onChange={(val) => q.worksheets.setSql(sheet.id, val)}
                        onRun={runCurrent}
                        onRunAll={runAll}
                        completion={completion}
                    />
                ) : (
                    <div className="result-message">
                        <SquareTerminal size={22} />
                        <div>
                            No file open. Pick one in the explorer , <span className="kbd">⌘P</span> to search ,{' '}
                            <span className="kbd">⌘N</span> for a new file.
                        </div>
                    </div>
                )}
            </div>
            <Splitter
                direction="horizontal"
                size={editorHeight}
                min={100}
                max={1200}
                onChange={setEditorHeight}
            />
            <div className="app-toolbar">
                <button
                    type="button"
                    className="btn is-primary"
                    onClick={runCurrent}
                    disabled={running}
                    title="Run the selection or the statement under the cursor"
                >
                    <Play size={12} fill="currentColor" /> Run <kbd>⌘↵</kbd>
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={runAll}
                    disabled={running}
                    title="Run every statement"
                >
                    Run All <kbd>⌘⇧↵</kbd>
                </button>
                <button
                    type="button"
                    className="btn is-ghost"
                    onClick={() => editorRef.current?.format()}
                    title="Format document"
                >
                    <WandSparkles size={13} /> Format <kbd>⇧⌥F</kbd>
                </button>
                <div className="toolbar-spacer" />
                {status()}
                <div className="toolbar-sep" />
                <button
                    type="button"
                    className="btn is-ghost"
                    disabled={result?.kind !== 'rows'}
                    title="Export every row of this result (CSV , JSON , JSON Lines , Parquet)"
                    onClick={() => result?.kind === 'rows' && q.onExport(result.statement)}
                >
                    <Download size={13} /> Export…
                </button>
            </div>
            {result?.kind === 'tx' ? (
                <div className="result-message">
                    <CircleCheck size={22} className="status-ok" />
                    <div>{result.message}</div>
                </div>
            ) : result?.kind === 'error' ? (
                <div className="result-message is-error">
                    <div className="error-box">
                        <CircleAlert size={15} />
                        <div>
                            {result.message}
                            {result.total > 1 && (
                                <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
                                    {result.statement}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : result?.kind === 'ok' ? (
                <div className="result-message">
                    <CircleCheck size={22} className="status-ok" />
                    <div>
                        Query OK · {result.affected.toLocaleString()} row
                        {result.affected === 1 ? '' : 's'} affected
                        {result.insertId ? ` · last insert id ${result.insertId}` : ''}
                    </div>
                </div>
            ) : result?.kind === 'rows' ? (
                <DataGrid
                    columns={columns}
                    rows={rows}
                    loading={running}
                    empty="Query returned no rows"
                />
            ) : (
                <div className="result-message">
                    <SquareTerminal size={22} />
                    <div>
                        Run a query with <span className="kbd">⌘↵</span>
                    </div>
                </div>
            )}
            <Modal
                open={!!implicit}
                icon={<CircleAlert size={16} style={{ color: 'var(--warning)' }} />}
                title="This statement commits your transaction"
                submitLabel="Commit & Run"
                onClose={() => {
                    implicit?.resolve(false);
                    setImplicit(null);
                }}
                onSubmit={() => {
                    implicit?.resolve(true);
                    setImplicit(null);
                }}
            >
                MySQL can't run schema changes (CREATE , ALTER , DROP , TRUNCATE , RENAME …) inside a
                transaction , it commits the open transaction first. Your {txn.tx.statements} uncommitted
                statement{txn.tx.statements === 1 ? '' : 's'} would become permanent.
                <pre className="value-viewer">{implicit?.statement}</pre>
            </Modal>
        </div>
    );
};

/** the Project tab without a folder : connect one */
function ProjectFolderPicker({ ws, label }: { ws: Worksheets; label: string }) {
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const run = async (fn: () => Promise<Error | null>) => {
        setBusy(true);
        setError('');
        const err = await fn();
        setBusy(false);
        if (err) setError(err.message);
    };
    return (
        <div className="folder-picker">
            <FolderOpen size={30} />
            <h3>Connect a project folder</h3>
            <p>
                Keep <code>.sql</code> files for <strong>{label}</strong> in a folder on disk , they show up in the explorer on the
                left and open here. Use git , Finder , or drop in files from anywhere.
            </p>
            <div className="actions">
                <button type="button" className="btn is-primary" disabled={busy} onClick={() => run(() => ws.chooseFolder(label))}>
                    Choose Folder…
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => run(() => ws.createDefaultFolder(label))}>
                    Use <code>~/Documents/Sequel Fidl/{label}</code>
                </button>
            </div>
            {error && <div className="error-box">{error}</div>}
        </div>
    );
}
