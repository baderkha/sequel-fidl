import { BrowserWindow, dialog, WebContents } from 'electron';
import { existsSync, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';
import { v4 } from 'uuid';
import { splitStatements } from '../../../shared/sql/statements';
import { MYSQLAdminCommand } from '../../util/sql_admin_commands/MYSQLAdminCommand';
import { ConManager } from '../Connections';
import { Transactions } from '../Transactions';
import { compressorDescriptors, compressorFor } from './compressors';
import { ExportCancelled, runPipeline } from './pipeline';
import { serializerFor, formatDescriptors } from './serializers';
import { chunkPath, fileSinks, memorySink } from './sinks';
import { MySQLSource } from './sources';
import { limitRows, normalize, pickColumns } from './transforms';
import {
    BatchExportRequest,
    BatchItemProgress,
    BatchProgress,
    ExistingFiles,
    ExportColumn,
    ExportPreview,
    ExportProgress,
    ExportRequest,
    ExportSourceSpec,
    RowSource,
    RowTransform,
} from './types';

export const EXPORT_PROGRESS_EV = 'export_progress';
export const EXPORT_BATCH_PROGRESS_EV = 'export_batch_progress';

const safeFileName = (name: string) => name.replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_').replace(/^\.+/, '_') || 'export';

/** callback style mysql2 call → promise */
const rawQuery = (conn: any, sql: string) =>
    new Promise<void>((resolve, reject) => conn.query(sql, (err: Error) => (err ? reject(err) : resolve())));

/**
 * where a table's file goes , by the existing files policy (null : skip it)
 * keep-both : city.csv → city (2).csv , checking the chunked names too
 */
export function batchTarget(dir: string, base: string, ext: string, existing: ExistingFiles): string | null {
    const taken = (file: string) => existsSync(file) || existsSync(chunkPath(file, ext, 0, 2));
    const first = path.join(dir, base + ext);
    if (existing === 'replace' || !taken(first)) return first;
    if (existing === 'skip') return null;
    for (let n = 2; ; n += 1) {
        const next = path.join(dir, `${base} (${n})${ext}`);
        if (!taken(next)) return next;
    }
}
const PREVIEW_ROWS = 5;
const PREVIEW_LINES = 80;
const PREVIEW_CHARS = 6000;

/** cut long previews on a line boundary , never mid value */
function clip(text: string): string {
    let out = text;
    const lines = out.split('\n');
    if (lines.length > PREVIEW_LINES) out = lines.slice(0, PREVIEW_LINES).join('\n');
    if (out.length > PREVIEW_CHARS) {
        const cut = out.lastIndexOf('\n', PREVIEW_CHARS);
        out = out.slice(0, cut > 0 ? cut : PREVIEW_CHARS);
    }
    return out.length < text.length ? `${out.replace(/\s+$/, '')}\n…` : text;
}
const READ_ONLY = /^\(*\s*(select|with|show|describe|desc|explain|table|values)\b/i;
const stripLeadingComments = (sql: string) => sql.replace(/^(\s*(--[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '');

type Planned = { source: RowSource; transforms: RowTransform[]; name: string };

/**
 * Builds export pipelines from requests : MySQL source → normalize / pick / limit → serializer → compressor → file
 */
export class ExportService {
    private static _instance: ExportService;
    private jobs = new Map<string, AbortController>();
    private admin = new MYSQLAdminCommand();

    static Default(): ExportService {
        if (!ExportService._instance) ExportService._instance = new ExportService();
        return ExportService._instance;
    }

    Formats() {
        return { formats: formatDescriptors(), compressors: compressorDescriptors() };
    }

    private connection(conID: string): Sequelize {
        const [, con] = ConManager.GetInstance().GetConById(conID);
        if (!con) throw new Error('The connection is closed.');
        return con;
    }

    /** a query source must be exactly one statement that only reads */
    static validateQuery(sql: string): string {
        const stmts = splitStatements(sql || '');
        if (stmts.length !== 1) throw new Error(stmts.length ? 'Export one statement at a time.' : 'There is no statement to export.');
        const text = stripLeadingComments(stmts[0].text);
        if (!READ_ONLY.test(text)) throw new Error('Only statements that return rows (SELECT , WITH , SHOW …) can be exported.');
        return stmts[0].text;
    }

    private plan(
        req: Pick<ExportRequest, 'conID' | 'source' | 'columns' | 'limit'>,
        opts: { preview?: boolean; columnsOnly?: boolean; connection?: unknown } = {}
    ): Planned {
        const con = this.connection(req.conID);
        const transaction = Transactions.get(req.conID);
        const shared = opts.connection;
        const spec: ExportSourceSpec = req.source;
        const limit = req.limit && req.limit > 0 ? Math.floor(req.limit) : undefined;
        const cap = opts.columnsOnly ? 0 : opts.preview ? Math.min(limit ?? PREVIEW_ROWS, PREVIEW_ROWS) : limit;

        if (spec.kind === 'table') {
            const table = {
                tableName: spec.table,
                columns: req.columns,
                filters: spec.filters,
                filterMode: spec.filterMode,
                orderByCol: spec.orderBy,
                orderDir: spec.orderDir,
            };
            const [sql, args] = this.admin.BuildSelect({ ...table, limit: cap });
            const [countSql, countArgs] = this.admin.BuildCount(spec.table, spec.filters, spec.filterMode);
            const source = new MySQLSource(con, sql, args, { transaction, connection: shared, count: { sql: countSql, args: countArgs } });
            const counted: RowSource = {
                open: () => source.open(),
                count: async () => {
                    const n = await source.count();
                    return n === null || limit === undefined ? n : Math.min(n, limit);
                },
            };
            return { source: counted, transforms: [normalize()], name: spec.table };
        }

        const sql = ExportService.validateQuery(spec.sql);
        const transforms: RowTransform[] = [normalize()];
        if (req.columns?.length) transforms.push(pickColumns(req.columns));
        if (cap !== undefined) transforms.push(limitRows(cap));
        return { source: new MySQLSource(con, sql, [], { transaction, connection: shared }), transforms, name: 'query' };
    }

    /** the columns the source produces (for picking them in the dialog) */
    async Columns(conID: string, source: ExportSourceSpec): Promise<{ columns?: ExportColumn[]; error?: string }> {
        try {
            const { source: s } = this.plan({ conID, source }, { columnsOnly: true });
            const opened = await s.open();
            await opened.close();
            return { columns: opened.columns };
        } catch (err) {
            return { error: (err as Error).message };
        }
    }

    /** the first rows as they'd be written (text formats) , or the output schema (parquet) */
    async Preview(req: ExportRequest): Promise<ExportPreview> {
        const serializer = serializerFor(req.format);
        if (!serializer) return { columns: [], error: `Unknown format ${req.format}` };
        try {
            if (serializer.describe) {
                const { columns: all, error } = await this.Columns(req.conID, req.source);
                if (error || !all) return { columns: [], error };
                const columns = req.columns?.length ? pickColumns(req.columns).columns(all) : all;
                return { columns, schema: serializer.describe(columns, req.options) };
            }
            const planned = this.plan(req, { preview: true });
            const sink = memorySink();
            const res = await runPipeline({
                source: planned.source,
                transforms: planned.transforms,
                serializer,
                options: req.options,
                compressor: null,
                sink: () => sink,
            });
            return { columns: res.columns, text: clip(sink.text()) };
        } catch (err) {
            return { columns: [], error: (err as Error).message };
        }
    }

    /** asks where to save , then exports in the background (progress events go to the window) */
    async Start(owner: WebContents, req: ExportRequest): Promise<{ jobId?: string; path?: string; cancelled?: boolean; error?: string }> {
        const serializer = serializerFor(req.format);
        if (!serializer) return { error: `Unknown format ${req.format}` };
        const compressor = serializer.streamCompressible ? compressorFor(req.compression?.id || 'none') : null;
        let planned: Planned;
        try {
            planned = this.plan(req);
        } catch (err) {
            return { error: (err as Error).message };
        }
        const ext = serializer.extension + (compressor ? compressor.extension : '');
        const base = (req.baseName || planned.name).replace(/[/\\:*?"<>|]+/g, '_');
        const dir = req.defaultDir || path.join(os.homedir(), 'Downloads');
        const win = BrowserWindow.fromWebContents(owner);
        const opts: Electron.SaveDialogOptions = {
            title: `Export ${serializer.label}`,
            defaultPath: path.join(dir, base + ext),
            buttonLabel: 'Export',
            filters: [{ name: `${serializer.label}${compressor ? ` (${compressor.label})` : ''}`, extensions: [ext.split('.').pop() as string] }],
        };
        const choice = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
        if (choice.canceled || !choice.filePath) return { cancelled: true };
        let target = choice.filePath;
        if (!target.endsWith(ext)) {
            // the dialog may only have added the last part (.gz)
            const last = path.extname(target);
            target = last && ext.endsWith(last) ? target.slice(0, -last.length) + ext : target + ext;
        }

        const jobId = v4();
        const controller = new AbortController();
        this.jobs.set(jobId, controller);
        const started = Date.now();
        const state: ExportProgress = { jobId, state: 'running', rows: 0, bytes: 0, total: null, ms: 0, path: target, parts: 0, files: [] };
        const sinks = fileSinks(target, ext);
        const chunk = req.chunk || serializer.defaultChunk || { by: 'none' };
        const send = (patch: Partial<ExportProgress>) => {
            Object.assign(state, patch, { ms: Date.now() - started });
            if (!owner.isDestroyed()) owner.send(EXPORT_PROGRESS_EV, { ...state });
        };
        // closing the window stops its exports
        const onGone = () => controller.abort();
        owner.once('destroyed', onGone);
        planned.source.count?.().then((total) => state.state === 'running' && send({ total }));

        runPipeline({
            source: planned.source,
            transforms: planned.transforms,
            serializer,
            options: req.options,
            compressor,
            level: req.compression?.level,
            sink: sinks.open,
            chunk,
            signal: controller.signal,
            onProgress: (p) => send({ rows: p.rows, bytes: p.bytes, parts: p.files }),
        })
            .then((res) => send({ state: 'done', rows: res.rows, bytes: res.bytes, parts: res.files, files: [...sinks.committed] }))
            .catch((err: Error) =>
                send(err instanceof ExportCancelled ? { state: 'cancelled' } : { state: 'error', error: err.message })
            )
            .finally(() => {
                this.jobs.delete(jobId);
                owner.removeListener('destroyed', onGone);
            });
        send({});
        return { jobId, path: target };
    }

    Cancel(jobId: string) {
        this.jobs.get(jobId)?.abort();
    }

    /** pick a folder (batch exports) */
    async ChooseDir(owner: WebContents, defaultDir: string | null): Promise<string | null> {
        const win = BrowserWindow.fromWebContents(owner);
        const opts: Electron.OpenDialogOptions = {
            title: 'Export to folder',
            buttonLabel: 'Choose',
            defaultPath: defaultDir || path.join(os.homedir(), 'Downloads'),
            properties: ['openDirectory', 'createDirectory'],
        };
        const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
    }

    /**
     * Many tables , one job : each table through the same pipeline into its own file(s) , one after the other ,
     * a failing table doesn't stop the rest
     */
    async StartBatch(owner: WebContents, req: BatchExportRequest): Promise<{ batchId?: string; dir?: string; error?: string }> {
        const serializer = serializerFor(req.format);
        if (!serializer) return { error: `Unknown format ${req.format}` };
        if (!req.items?.length) return { error: 'No tables to export.' };
        if (!req.dir) return { error: 'Choose a folder.' };
        let con: Sequelize;
        try {
            con = this.connection(req.conID);
        } catch (err) {
            return { error: (err as Error).message };
        }
        const compressor = serializer.streamCompressible ? compressorFor(req.compression?.id || 'none') : null;
        const ext = serializer.extension + (compressor ? compressor.extension : '');
        const dir = req.subfolder ? path.join(req.dir, safeFileName(req.subfolder)) : req.dir;
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            return { error: `Can't create ${dir}: ${(err as Error).message}` };
        }

        const batchId = v4();
        const controller = new AbortController();
        this.jobs.set(batchId, controller);
        const started = Date.now();
        const items: BatchItemProgress[] = req.items.map((i) => ({ table: i.table, state: 'queued', rows: 0, bytes: 0, total: null, files: [] }));
        const state: BatchProgress = { batchId, state: 'running', dir, items, ms: 0 };
        let lastSent = 0;
        const send = (force = false) => {
            const now = Date.now();
            if (!force && now - lastSent < 250) return;
            lastSent = now;
            state.ms = now - started;
            if (!owner.isDestroyed()) owner.send(EXPORT_BATCH_PROGRESS_EV, JSON.parse(JSON.stringify(state)));
        };
        const onGone = () => controller.abort();
        owner.once('destroyed', onGone);

        const run = async () => {
            // one snapshot for every table : rows that reference each other stay consistent
            let shared: any = null;
            const manager: any = (con as any).connectionManager;
            if (req.snapshot && !Transactions.isOpen(req.conID)) {
                try {
                    shared = await manager.getConnection({ type: 'read' });
                    await rawQuery(shared, 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
                } catch (err) {
                    if (shared) manager.releaseConnection(shared);
                    shared = null;
                }
            }
            try {
                for (let i = 0; i < req.items.length; i += 1) {
                    const item = items[i];
                    if (controller.signal.aborted) {
                        item.state = 'cancelled';
                        continue;
                    }
                    const target = batchTarget(dir, safeFileName(req.items[i].table), ext, req.existing);
                    if (!target) {
                        item.state = 'skipped';
                        send(true);
                        continue;
                    }
                    item.state = 'running';
                    send(true);
                    try {
                        const planned = this.plan(
                            { conID: req.conID, source: { kind: 'table', table: req.items[i].table }, columns: req.items[i].columns, limit: req.limit },
                            { connection: shared }
                        );
                        planned.source.count?.().then((total) => {
                            item.total = total;
                            send();
                        });
                        const sinks = fileSinks(target, ext);
                        // eslint-disable-next-line no-await-in-loop
                        const res = await runPipeline({
                            source: planned.source,
                            transforms: planned.transforms,
                            serializer,
                            options: req.options,
                            compressor,
                            level: req.compression?.level,
                            sink: sinks.open,
                            chunk: req.chunk || serializer.defaultChunk,
                            signal: controller.signal,
                            onProgress: (p) => {
                                item.rows = p.rows;
                                item.bytes = p.bytes;
                                send();
                            },
                        });
                        Object.assign(item, { state: 'done', rows: res.rows, bytes: res.bytes, files: [...sinks.committed] });
                    } catch (err) {
                        if (err instanceof ExportCancelled) item.state = 'cancelled';
                        else Object.assign(item, { state: 'error', error: (err as Error).message });
                    }
                    send(true);
                }
            } finally {
                if (shared) {
                    await rawQuery(shared, 'COMMIT').catch(() => {});
                    manager.releaseConnection(shared);
                }
            }
        };
        run()
            .catch(() => {})
            .finally(() => {
                state.state = controller.signal.aborted ? 'cancelled' : 'done';
                this.jobs.delete(batchId);
                owner.removeListener('destroyed', onGone);
                send(true);
            });
        send(true);
        return { batchId, dir };
    }

    CancelAll() {
        this.jobs.forEach((c) => c.abort());
    }
}
