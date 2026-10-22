import { QueryTypes, Sequelize } from 'sequelize';
import { ExportColumn, OpenedSource, Row, RowSource } from './types';
import type { SQLSourceOptions } from './sources';

const Cursor = require('pg-cursor');
const pg = require('pg');
const parseArray = require('postgres-array').parse;
let nextSavepoint = 0;

const KINDS: Record<number, ExportColumn['kind']> = {
    16: 'bool',
    17: 'binary',
    20: 'int64',
    21: 'int32',
    23: 'int32',
    26: 'int64',
    700: 'float',
    701: 'double',
    1082: 'date',
    1083: 'time',
    1114: 'datetime',
    1184: 'datetime',
    1266: 'time',
    1700: 'decimal',
    114: 'json',
    3802: 'json',
};

/** Server text parsers preserve decimals, big integers and fractional timestamps. */
export class PostgresSource implements RowSource {
    constructor(
        private con: Sequelize,
        private sql: string,
        private args: unknown[],
        private opts: SQLSourceOptions = {}
    ) {}
    async count(): Promise<number | null> {
        if (!this.opts.count) return null;
        const query = (transaction = this.opts.transaction) =>
            this.con.query(this.opts.count.sql, {
                replacements: this.opts.count.args,
                type: QueryTypes.SELECT,
                transaction,
            });
        const rows: any[] = await (this.opts.transaction
            ? this.con.transaction(
                  { transaction: this.opts.transaction },
                  (savepoint) => query(savepoint)
              )
            : query()
        ).catch(() => []);
        return rows.length ? Number(Object.values(rows[0])[0]) : null;
    }
    async open(): Promise<OpenedSource> {
        const manager: any = (this.con as any).connectionManager;
        const borrowed: any =
            this.opts.connection || (this.opts.transaction as any)?.connection;
        const conn =
            borrowed || (await manager.getConnection({ type: 'read' }));
        const pooled = !borrowed;
        let cursor: any;
        let failed = false;
        const savepoint = borrowed
            ? `sequel_fidl_export_${++nextSavepoint}`
            : null;
        const restore = async (rollback: boolean) => {
            if (savepoint) {
                if (rollback)
                    await conn.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
            } else if (pooled) await conn.query('ROLLBACK');
        };
        const release = () => pooled && manager.releaseConnection(conn);
        try {
            if (pooled)
                await conn.query(
                    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
                );
            else await conn.query(`SAVEPOINT ${savepoint}`);
            const typesResult = await conn.query(
                'SELECT oid,typname,typcategory,typelem,typbasetype FROM pg_type'
            );
            const types = new Map<number, any>(
                typesResult.rows.map((r: any) => [Number(r.oid), r])
            );
            const parse = (oid: number, value: string, nested = false): any => {
                const type = types.get(oid);
                if (type?.typbasetype)
                    return parse(Number(type.typbasetype), value);
                if (type?.typcategory === 'A')
                    return parseArray(value, (v: string) =>
                        parse(Number(type.typelem), v, true)
                    );
                if (oid === 16) return value === 't';
                if (oid === 17) return pg.types.getTypeParser(17)(value);
                if (oid === 21 || oid === 23 || oid === 700 || oid === 701)
                    return Number(value);
                if (oid === 114 || oid === 3802)
                    return nested ? JSON.parse(value) : value;
                if (oid === 1184 && /[+-]\d\d(?::\d\d)?$/.test(value)) {
                    const date = new Date(value);
                    if (!Number.isNaN(date.getTime()))
                        return (
                            date.toISOString().slice(0, 19).replace('T', ' ') +
                            (value.match(/\.\d+/)?.[0] || '')
                        );
                }
                return value;
            };
            // Sequelize escapes replacement arguments using the active dialect.
            // The cursor then receives one complete SQL statement with no bind values.
            const formatted = this.renderTableQuery();
            cursor = conn.query(
                new Cursor(formatted, [], {
                    rowMode: 'array',
                    types: {
                        getTypeParser: (oid: number) => (value: string) =>
                            parse(oid, value),
                    },
                })
            );
            const size = this.opts.batchSize || 1000;
            const read = () =>
                new Promise<{ rows: Row[]; fields: any[] }>((resolve, reject) =>
                    cursor.read(
                        size,
                        (err: Error, rows: Row[], result: any) => {
                            if (err) {
                                failed = true;
                                reject(err);
                            } else
                                resolve({
                                    rows,
                                    fields:
                                        result?.fields || cursor._result.fields,
                                });
                        }
                    )
                );
            const first = await read();
            const columns: ExportColumn[] = first.fields.map((field) => {
                const raw = types.get(field.dataTypeID);
                const base = raw?.typbasetype
                    ? Number(raw.typbasetype)
                    : field.dataTypeID;
                const kind =
                    raw?.typcategory === 'A' ? 'json' : KINDS[base] || 'string';
                const mod = field.dataTypeModifier;
                const precision =
                    base === 1700 && mod >= 4
                        ? ((mod - 4) >> 16) & 65535
                        : undefined;
                const encodedScale =
                    base === 1700 && mod >= 4 ? (mod - 4) & 2047 : undefined;
                const scale =
                    encodedScale === undefined
                        ? undefined
                        : encodedScale >= 1024
                        ? encodedScale - 2048
                        : encodedScale;
                return {
                    name: field.name,
                    kind,
                    sqlType: raw?.typname || String(field.dataTypeID),
                    ...(kind === 'decimal' && precision !== undefined
                        ? {
                              precision: Math.max(
                                  precision - Math.min(scale, 0),
                                  scale
                              ),
                              scale: Math.max(scale, 0),
                          }
                        : {}),
                    ...(kind === 'datetime' ? { fsp: mod >= 0 ? mod : 6 } : {}),
                };
            });
            let closing: Promise<void> | null = null;
            const close = () => {
                closing =
                    closing ||
                    (async () => {
                        await cursor.close().catch(() => {});
                        await restore(failed).catch(() => {});
                        await release();
                    })();
                return closing;
            };
            async function* batches(): AsyncGenerator<Row[]> {
                let batch = first.rows;
                while (batch.length) {
                    yield batch;
                    batch = (await read()).rows;
                }
            }
            return { columns, batches: batches(), close };
        } catch (err) {
            if (cursor) await cursor.close().catch(() => {});
            await restore(true).catch(() => {});
            await release();
            throw err;
        }
    }

    private renderTableQuery(): string {
        // Only generated table filters have replacement values. Ad-hoc query
        // exports have no arguments and retain PostgreSQL's question-mark operators.
        if (!this.args.length) return this.sql;
        let quoted = false;
        let index = 0;
        let out = '';
        for (let i = 0; i < this.sql.length; i++) {
            const char = this.sql[i];
            if (char === '"') {
                out += char;
                if (quoted && this.sql[i + 1] === '"') out += this.sql[++i];
                else quoted = !quoted;
            } else if (char === '?' && !quoted) {
                const value = this.args[index++];
                out += Array.isArray(value)
                    ? value.map((v) => this.con.escape(v)).join(', ')
                    : this.con.escape(value);
            } else out += char;
        }
        if (index !== this.args.length)
            throw new Error(
                'The table filter arguments do not match the query.'
            );
        return out;
    }
}
