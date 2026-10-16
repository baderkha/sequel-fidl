import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { columnFromField, DriverField } from './columns';
import { OpenedSource, Row, RowSource } from './types';

export type MySQLSourceOptions = {
    /** run on this transaction's connection (sees its uncommitted changes) instead of a pooled one */
    transaction?: Transaction;
    /**
     * run on this raw connection (borrowed , not released) , e.g. one holding a snapshot shared by
     * several exports
     */
    connection?: unknown;
    /** SELECT COUNT(*) ... for progress */
    count?: { sql: string; args: unknown[] };
    batchSize?: number;
};

/** callback style mysql2 call → promise */
const run = (conn: any, sql: string) =>
    new Promise<void>((resolve, reject) => conn.query(sql, (err: Error) => (err ? reject(err) : resolve())));

/**
 * Streams one SELECT from MySQL with exact values (dates as stored , big numbers / decimals as strings)
 *
 * On a pooled connection it runs in a READ ONLY consistent snapshot : one point in time for the whole
 * export , and the statement can't write
 */
export class MySQLSource implements RowSource {
    private con: Sequelize;
    private sql: string;
    private args: unknown[];
    private opts: MySQLSourceOptions;

    constructor(con: Sequelize, sql: string, args: unknown[], opts: MySQLSourceOptions = {}) {
        this.con = con;
        this.sql = sql;
        this.args = args;
        this.opts = opts;
    }

    async count(): Promise<number | null> {
        const c = this.opts.count;
        if (!c) return null;
        const rows: any[] = await this.con
            .query(c.sql, { replacements: c.args, type: QueryTypes.SELECT, transaction: this.opts.transaction })
            .catch((): any[] => []);
        const n = rows[0] ? Number(Object.values(rows[0])[0]) : NaN;
        return Number.isFinite(n) ? n : null;
    }

    async open(): Promise<OpenedSource> {
        const manager: any = (this.con as any).connectionManager;
        const borrowed = this.opts.connection || (this.opts.transaction ? (this.opts.transaction as any).connection : null);
        const conn: any = borrowed || (await manager.getConnection({ type: 'read' }));
        const pooled = !borrowed;
        const release = () => pooled && manager.releaseConnection(conn);
        let snapshot = false;
        if (pooled) {
            try {
                await run(conn, 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
                snapshot = true;
            } catch (err) {
                release();
                throw err;
            }
        }

        const query = conn.query({
            sql: this.sql,
            values: this.args,
            rowsAsArray: true,
            dateStrings: true,
            supportBigNumbers: true,
            bigNumberStrings: true,
            // sequelize's typeCast (dates → Date in its timezone) would win over the options above
            typeCast: (_field: unknown, next: () => unknown) => next(),
        });
        const stream = query.stream({ highWaterMark: this.opts.batchSize || 1000 });
        // errors reach the caller through the query events / the row iterator , an unhandled
        // 'error' on the stream itself would be an uncaught exception in the main process
        stream.on('error', () => {});
        let finished = false;
        const markFinished = () => {
            finished = true;
        };
        query.on('end', markFinished);
        query.on('error', markFinished);

        // columns come before the first row (or the statement ends without a result set)
        const fields: DriverField[] | null = await new Promise((resolve, reject) => {
            query.once('fields', (f: DriverField[]) => resolve(f));
            query.once('error', reject);
            query.once('end', () => resolve(null));
        }).catch(async (err) => {
            if (snapshot) await run(conn, 'ROLLBACK').catch(() => {});
            release();
            throw err;
        });
        if (!fields) {
            if (snapshot) await run(conn, 'ROLLBACK').catch(() => {});
            release();
            throw new Error("The statement doesn't return rows.");
        }

        const size = this.opts.batchSize || 1000;
        async function* batches(): AsyncGenerator<Row[]> {
            let batch: Row[] = [];
            for await (const row of stream) {
                batch.push(row as Row);
                if (batch.length >= size) {
                    yield batch;
                    batch = [];
                }
            }
            if (batch.length) yield batch;
        }

        const stop = async () => {
            if (!finished) {
                // stopped early : end it on the server , then drop whatever is still in flight.
                // the row stream re-pauses the connection when it can't take a row , so detach it first
                await this.con.query(`KILL QUERY ${Number(conn.threadId)}`).catch(() => {});
                query.removeAllListeners('result');
                query.on('result', () => {});
                conn.resume?.();
                await new Promise<void>((resolve) => {
                    if (finished) return resolve();
                    const timer = setTimeout(resolve, 5000);
                    const done = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                    query.once('end', done);
                    query.once('error', done);
                });
                if (pooled && !finished) {
                    // still busy : don't hand a stuck connection back to the pool
                    conn.destroy?.();
                    release();
                    return;
                }
            }
            if (snapshot) await run(conn, 'COMMIT').catch(() => {});
            release();
        };
        // cancel and the pipeline's cleanup may both close , they share one shutdown
        let closing: Promise<void> | null = null;
        const close = () => {
            closing = closing || stop();
            return closing;
        };

        return { columns: fields.map(columnFromField), batches: batches(), close };
    }
}
