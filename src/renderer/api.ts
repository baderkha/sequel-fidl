import type { DialectInfoRes } from 'main/service/SQLService';
import type {
    ColSchema,
    ColumnAssignment,
    Filter,
    RowKey,
    SelectInput,
    Table,
} from 'main/util/sql_admin_commands';
import type { ErrorTuple } from 'main/util/tuple';
import type { SessionInfo } from 'main/service/Sessions';
import type { ConnectionInput, SavedConnection } from 'main/service/ConnectionService';
import type { NewPlaygroundInput, PlaygroundInfo } from 'main/service/PlaygroundService';
import type { TxLogEntry } from 'main/service/Transactions';
import type { ExplorerTree, FolderInfo, WorksheetInfo } from 'main/service/WorksheetService';
import type { FsEntry } from 'main/service/WorkspaceService';
import type { TerminalCreateInput, TerminalInfo } from 'main/service/terminal/TerminalService';
import type { TerminalProfileId } from 'main/service/terminal/profiles';
import type {
    BatchExportRequest,
    BatchItemProgress,
    BatchProgress,
    ExistingFiles,
    CompressorDescriptor,
    ExportColumn,
    ExportPreview,
    ExportProgress,
    ExportRequest,
    ExportSourceSpec,
    FormatDescriptor,
    FormatId,
    FormatOptionsMap,
} from 'main/service/export/types';

export type { ColSchema, ColumnAssignment, Filter, RowKey, Table, DialectInfoRes, ErrorTuple };
export type {
    SessionInfo,
    ConnectionInput,
    SavedConnection,
    NewPlaygroundInput,
    PlaygroundInfo,
    TxLogEntry,
    WorksheetInfo,
    FolderInfo,
    ExplorerTree,
    FsEntry,
    TerminalCreateInput,
    TerminalInfo,
    TerminalProfileId,
    CompressorDescriptor,
    ExportColumn,
    ExportPreview,
    ExportProgress,
    ExportRequest,
    ExportSourceSpec,
    FormatDescriptor,
    FormatId,
    FormatOptionsMap,
    BatchExportRequest,
    BatchItemProgress,
    BatchProgress,
    ExistingFiles,
};
export type SortDirection = 'ASC' | 'DESC';

/**
 * The main process handlers read `arg.Data` (see main/util/event) ,
 * build the same envelope here so the renderer doesn't import main process code
 */
const invoke = <T>(channel: string, data: object): Promise<T> =>
    window.electron.ipcRenderer.invoke(channel, {
        Data: data,
        CreatedAt: new Date(),
    });

/**
 * Subscribe to an event pushed by the main process , returns the unsubscribe function
 */
export const onMainEvent = <T>(channel: string, cb: (payload: T) => void) =>
    window.electron.ipcRenderer.on(channel, (payload) => cb(payload as T));

export const api = {
    // windows
    /** the session this window shows , null => this is the launcher */
    windowSession: (): Promise<SessionInfo | null> =>
        window.electron.ipcRenderer.invoke('window_session', {}),
    openWorkspace: (conID: string) => invoke<Error | null>('open_workspace', { conID }),
    showLauncher: () => invoke<void>('show_launcher', {}),

    // project folder (files on disk)
    workspaceFolder: (scope: string) => invoke<string | null>('workspace_folder', { scope }),
    chooseWorkspaceFolder: (scope: string, label: string) =>
        invoke<ErrorTuple<string | null>>('workspace_choose_folder', { scope, label }),
    defaultWorkspaceFolder: (scope: string, label: string) =>
        invoke<ErrorTuple<string>>('workspace_default_folder', { scope, label }),
    workspaceTree: (scope: string) => invoke<FsEntry[]>('workspace_tree', { scope }),
    readFile: (scope: string, rel: string) => invoke<ErrorTuple<string>>('workspace_read', { scope, rel }),
    writeFile: (scope: string, rel: string, content: string) =>
        invoke<Error | null>('workspace_write', { scope, rel, content }),
    createFileOnDisk: (scope: string, dir: string, name: string, content = '') =>
        invoke<ErrorTuple<string>>('workspace_create_file', { scope, dir, name, content }),
    createFolderOnDisk: (scope: string, dir: string, name: string) =>
        invoke<ErrorTuple<string>>('workspace_create_folder', { scope, dir, name }),
    movePath: (scope: string, from: string, to: string) =>
        invoke<ErrorTuple<string>>('workspace_move', { scope, from, to }),
    trashPath: (scope: string, rel: string) => invoke<Error | null>('workspace_trash', { scope, rel }),
    copyIntoWorkspace: (scope: string, sources: string[], dir: string) =>
        invoke<ErrorTuple<string[]>>('workspace_copy_in', { scope, sources, dir }),
    revealPath: (scope: string, rel: string) => invoke<void>('workspace_reveal', { scope, rel }),
    openExternally: (scope: string, rel: string) => invoke<string>('workspace_open_external', { scope, rel }),
    watchWorkspace: (scope: string) => invoke<void>('workspace_watch', { scope }),

    // embedded terminal
    /** output , info and exit arrive as terminal_data / terminal_info / terminal_exit for `input.id` */
    terminalCreate: (input: TerminalCreateInput) => invoke<{ error?: string }>('terminal_create', input),
    // exports : progress arrives as export_progress events
    exportFormats: () => invoke<{ formats: FormatDescriptor[]; compressors: CompressorDescriptor[] }>('export_formats', {}),
    exportColumns: (conID: string, source: ExportSourceSpec) =>
        invoke<{ columns?: ExportColumn[]; error?: string }>('export_columns', { conID, source }),
    exportPreview: (req: ExportRequest) => invoke<ExportPreview>('export_preview', req),
    exportStart: (req: ExportRequest) =>
        invoke<{ jobId?: string; path?: string; cancelled?: boolean; error?: string }>('export_start', req),
    exportCancel: (jobId: string) => invoke<void>('export_cancel', { jobId }),
    /** folder picker , null when cancelled */
    exportChooseDir: (defaultDir: string | null) => invoke<string | null>('export_choose_dir', { defaultDir }),
    /** progress arrives as export_batch_progress , cancel with exportCancel(batchId) */
    exportBatchStart: (req: BatchExportRequest) =>
        invoke<{ batchId?: string; dir?: string; error?: string }>('export_batch_start', req),
    /** show a file in Finder */
    revealFile: (path: string) => invoke<void>('export_reveal', { path }),
    terminalWrite: (id: string, data: string) => invoke<void>('terminal_write', { id, data }),
    terminalResize: (id: string, cols: number, rows: number) =>
        invoke<void>('terminal_resize', { id, cols, rows }),
    terminalKill: (id: string) => invoke<void>('terminal_kill', { id }),

    // worksheets
    worksheetTree: (scope: string) => invoke<ExplorerTree>('worksheet_tree', { scope }),
    createWorksheet: (scope: string, name: string, sql = '', folderId: number | null = null) =>
        invoke<ErrorTuple<WorksheetInfo>>('create_worksheet', { scope, name, sql, folderId }),
    updateWorksheet: (id: number, patch: { name?: string; sql?: string; folderId?: number | null }) =>
        invoke<Error | null>('update_worksheet', { id, ...patch }),
    deleteWorksheet: (id: number) => invoke<Error | null>('delete_worksheet', { id }),
    createFolder: (scope: string, name: string, parentId: number | null) =>
        invoke<ErrorTuple<FolderInfo>>('create_folder', { scope, name, parentId }),
    updateFolder: (id: number, patch: { name?: string; parentId?: number | null }) =>
        invoke<Error | null>('update_folder', { id, ...patch }),
    deleteFolder: (id: number) => invoke<Error | null>('delete_folder', { id }),

    // saved direct connections
    listConnections: () => invoke<SavedConnection[]>('list_connections', {}),
    saveConnection: (c: ConnectionInput) =>
        invoke<ErrorTuple<SavedConnection>>('save_connection', c),
    deleteConnection: (id: number) => invoke<Error | null>('delete_connection', { id }),
    testConnection: (c: ConnectionInput) =>
        invoke<ErrorTuple<string>>('test_connection', c),
    connect: (c: ConnectionInput) => invoke<ErrorTuple<SessionInfo>>('connect', c),
    disconnect: (conID: string) =>
        invoke<{ stoppedPlayground: boolean }>('disconnect', { conID }),

    // playgrounds
    dockerAvailable: () => invoke<boolean>('docker_available', {}),
    listPlaygrounds: () => invoke<PlaygroundInfo[]>('list_playgrounds', {}),
    createPlayground: (p: NewPlaygroundInput) =>
        invoke<ErrorTuple<PlaygroundInfo>>('create_playground', p),
    renamePlayground: (id: number, name: string) =>
        invoke<Error | null>('rename_playground', { id, name }),
    openPlayground: (id: number) =>
        invoke<ErrorTuple<SessionInfo>>('open_playground', { id }),
    stopPlayground: (id: number) => invoke<Error | null>('stop_playground', { id }),
    deletePlayground: (id: number) => invoke<Error | null>('delete_playground', { id }),

    dialectInfo: (conID: string) =>
        invoke<DialectInfoRes>('get_dialect_info', { conID }),
    listDatabases: (conID: string) =>
        invoke<string[]>('list_databases', { conID }),
    switchDatabase: (conID: string, dbName: string) =>
        invoke<Error | null>('switch_database', { conID, dbName }),
    listTables: (conID: string) => invoke<Table[]>('show_all_tables', { conID }),
    schema: (conID: string, tableName: string) =>
        invoke<ColSchema[]>('show_schema', { conID, tableName }),
    createSQL: (conID: string, tableName: string) =>
        invoke<string>('get_create_sql', { conID, tableName }),
    selectRows: (conID: string, s: SelectInput) =>
        invoke<ErrorTuple<any[]>>('select_from_table', { conID, s }),
    insertRows: (
        conID: string,
        tableName: string,
        columns: string[],
        rows: any[][],
        ignore: boolean
    ) =>
        invoke<ErrorTuple<number>>('insert_rows', { conID, tableName, columns, rows, ignore }),
    deleteRows: (conID: string, tableName: string, keys: RowKey[], byAllColumns: boolean) =>
        invoke<ErrorTuple<number>>('delete_rows', { conID, tableName, keys, byAllColumns }),
    updateRows: (
        conID: string,
        tableName: string,
        set: ColumnAssignment[],
        keys: RowKey[],
        byAllColumns: boolean
    ) =>
        invoke<ErrorTuple<number>>('update_rows', { conID, tableName, set, keys, byAllColumns }),
    listSamples: () =>
        invoke<{ id: string; name: string; description: string; database: string }[]>(
            'list_samples',
            {}
        ),
    countRows: (
        conID: string,
        tableName: string,
        filters: Filter[],
        mode: 'AND' | 'OR' = 'AND'
    ) =>
        invoke<ErrorTuple<number>>('count_table_rows', {
            conID,
            tableName,
            filters,
            mode,
        }),
    runQuery: (conID: string, query: string, opts: { commitFirst?: boolean } = {}) =>
        invoke<ErrorTuple<any>>('run_manual_query', { conID, query, ...opts }),
    beginTransaction: (conID: string) => invoke<Error | null>('begin_transaction', { conID }),
    commitTransaction: (conID: string) => invoke<Error | null>('commit_transaction', { conID }),
    rollbackTransaction: (conID: string) => invoke<Error | null>('rollback_transaction', { conID }),
    transactionLog: (conID: string) => invoke<TxLogEntry[]>('transaction_log', { conID }),
    transactionState: (conID: string) =>
        invoke<{ open: boolean; startedAt: number; statements?: number }>('transaction_state', { conID }),
    /** rows of a query , throws the server error */
    rows: async (conID: string, query: string): Promise<any[]> => {
        const [rows, err] = await invoke<ErrorTuple<any>>('run_manual_query', { conID, query });
        if (err) {
            throw err;
        }
        return Array.isArray(rows) ? rows : [];
    },
    cloneTable: (
        conID: string,
        oldTable: string,
        newTable: string,
        mustDuplicateData: boolean
    ) =>
        invoke<Error | null>('clone_table', {
            conID,
            oldTable,
            newTable,
            mustDuplicateData,
        }),
    renameTable: (conID: string, oldTable: string, newTable: string) =>
        invoke<Error | null>('rename_table', { conID, oldTable, newTable }),
    truncateTable: (conID: string, tableName: string) =>
        invoke<Error | null>('truncate_table', { conID, tableName }),
    dropTable: (conID: string, tableName: string) =>
        invoke<Error | null>('drop_table', { conID, tableName }),
};
