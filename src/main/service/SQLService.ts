import { DBType } from '../model/Connections';
import { Dialect } from 'sequelize';
import { Sequelize } from 'sequelize';
import {
    AdminSQLCommand,
    ColSchema,
    CreateColSchema,
    ColumnAssignment,
    Filter,
    FilterMode,
    RowKey,
    SelectInput,
    Table,
} from '../util/sql_admin_commands';
import { ConManager } from './Connections';
import { waitTillConnection } from './db/ConnectionFactory';
import { MYSQLAdminCommand } from '../util/sql_admin_commands/MYSQLAdminCommand';
import { PostgresAdminCommand } from '../util/sql_admin_commands/PostgresAdminCommand';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';
import { commitsImplicitly, describeStatement, endsTransaction, Transactions } from './Transactions';

const MAX_LOGGED_KEYS = 20;

/** prefix the renderer looks for to offer "commit and run" */
export const IMPLICIT_COMMIT_ERROR = '[implicit-commit]';

const busyWithTransaction = () =>
    new Error('A transaction is open in this window , commit or roll it back first.');
export type DialectInfoRes = {
    Dialect?: string;
    Version?: string;
    DatabaseName?: string;
};
/**
 *
 * SQL service, allows you to run supported queries for a connection id
 * @author Ahmad Baderkhan
 */
export class SQLService {
    private conMgr: ConManager;
    private adminSQLRunner: Map<DBType, AdminSQLCommand>;
    private static _instance: SQLService;

    constructor(conMgr: ConManager, runners: Map<DBType, AdminSQLCommand>) {
        this.conMgr = conMgr;
        this.adminSQLRunner = runners;
    }

    private rnr(dialect: string) {
        return this.adminSQLRunner.get(dialect as DBType);
    }

    private logValue(con: Sequelize, value: any): string {
        if (value instanceof Uint8Array) value = Buffer.from(value);
        if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
            return con.escape(JSON.stringify(value));
        }
        return con.escape(value);
    }

    /** readable WHERE for a list of row keys (values inlined , long lists shortened) , for the transaction log */
    private keysForLog(con: Sequelize, keys: RowKey[]): string {
        const q = (c: string) => this.rnr(con.getDialect()).QuoteIdent(c);
        const cols = Object.keys(keys[0] || {});
        const shown = keys.slice(0, MAX_LOGGED_KEYS);
        const rest = keys.length - shown.length;
        const tail = rest > 0 ? ` /* … ${rest} more */` : '';
        if (cols.length === 1) {
            return `${q(cols[0])} IN (${shown.map((k) => this.logValue(con,k[cols[0]])).join(', ')}${tail})`;
        }
        return `${shown
            .map((k) => `(${cols.map((c) => `${q(c)} ${this.rnr(con.getDialect()).NullComparison()} ${this.logValue(con,k[c])}`).join(' AND ')})`)
            .join(' OR ')}${tail}`;
    }

    /** log a grid write that ran inside the open transaction */
    private logGridWrite(
        conID: string,
        res: ErrorTuple<number>,
        op: string,
        table: string,
        sql: string
    ): ErrorTuple<number> {
        if (Transactions.isOpen(conID)) {
            const [n, err] = res;
            Transactions.record(conID, {
                sql,
                op,
                table,
                source: 'grid',
                ...(err ? { error: err.message } : { affected: n }),
            });
        }
        return res;
    }

    static Default(): SQLService {
        if (!SQLService._instance) {
            let mp: Map<DBType, AdminSQLCommand> = new Map();
            mp.set('mysql', new MYSQLAdminCommand());
            mp.set('postgres', new PostgresAdminCommand());
            SQLService._instance = new SQLService(ConManager.GetInstance(), mp);
        }
        return SQLService._instance;
    }

    /**
     * Get Dialect specific meta info
     * @param conID
     */
    async GetDialectInfo(conID: string): Promise<DialectInfoRes> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve({});
        }
        const dbName = con.getDatabaseName();
        const dialect = con.getDialect();
        const version = await con.databaseVersion();
        con.getQueryInterface();
        return {
            DatabaseName: dbName,
            Dialect: dialect,
            Version: version,
        };
    }
    /**
     * Run a random query
     * @param conID
     * @param query
     */
    async RunManualQuery(
        conID: string,
        query: string,
        opts: { commitFirst?: boolean } = {}
    ): Promise<ErrorTuple<any[]>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return NewErrorTuple([], new Error('no valid connection !'));
        }
        let transaction = Transactions.get(conID);
        if (transaction && con.getDialect() === 'mysql' && commitsImplicitly(query)) {
            if (!opts.commitFirst) {
                return NewErrorTuple(
                    [],
                    new Error(
                        `${IMPLICIT_COMMIT_ERROR} MySQL commits the open transaction before running this statement.`
                    )
                );
            }
            const err = await Transactions.commit(conID);
            if (err) {
                return NewErrorTuple([], err);
            }
            transaction = undefined;
        }
        try {
            // PostgreSQL aborts a transaction after a failed statement. A savepoint
            // preserves the app's transaction so the user can correct the query.
            const data = transaction && con.getDialect() === 'postgres'
                ? await con.transaction({ transaction }, (savepoint) => con.query(query, { transaction: savepoint }))
                : await con.query(query, { transaction });
            if (transaction) {
                const res: any = data[0];
                Transactions.record(conID, {
                    sql: query.trim(),
                    ...describeStatement(query),
                    source: 'editor',
                    ...(Array.isArray(res)
                        ? { rows: res.length }
                        : {
                              affected: Number(res?.affectedRows) || 0,
                              changed: res?.changedRows !== undefined ? Number(res.changedRows) : undefined,
                              insertId: Number(res?.insertId) || undefined,
                          }),
                });
            }
            return NewErrorTuple(data[0] as any[], null);
        } catch (err) {
            if (transaction) {
                Transactions.record(conID, {
                    sql: query.trim(),
                    ...describeStatement(query),
                    source: 'editor',
                    error: (err as Error).message,
                });
            }
            if (transaction && endsTransaction(err)) {
                await Transactions.drop(conID, 'MySQL rolled the transaction back (deadlock)');
            }
            return NewErrorTuple([], err as Error);
        }
    }

    BeginTransaction(conID: string): Promise<Error | null> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(new Error('no valid connection !'));
        }
        return Transactions.begin(con, conID);
    }

    CommitTransaction(conID: string): Promise<Error | null> {
        return Transactions.commit(conID);
    }

    RollbackTransaction(conID: string): Promise<Error | null> {
        return Transactions.rollback(conID);
    }
    /**
     * Get a list of tables + views
     * @param conID
     */
    ShowAllTables(conID: string): Promise<Table[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ShowAllTables(con, Transactions.get(conID));
    }
    /**
     * Get the DDL stmt for table
     * @param conID
     * @param tableName
     */
    ShowCreateSQL(conID: string, tableName: string): Promise<string> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve('');
        }
        return this.rnr(con.getDialect()).ShowCreateSQL(con, tableName, Transactions.get(conID));
    }
    /**
     * Get Schema for a table
     * @param conID
     * @param tableName
     */
    ShowSchema(conID: string, tableName: string): Promise<ColSchema[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ShowSchema(con, tableName, Transactions.get(conID));
    }

    async TableMetadata(conID: string, tableName: string) {
        const [, con] = this.conMgr.GetConById(conID);
        if (!con) throw new Error('The connection is closed.');
        return this.rnr(con.getDialect()).GetTableMetadata(con, tableName, Transactions.get(conID));
    }

    async ApplySchemaChanges(conID: string, statements: string[]): Promise<{ error?: string }> {
        const [, con] = this.conMgr.GetConById(conID);
        if (!con) return { error:'The connection is closed.' };
        if (con.getDialect() !== 'postgres') return { error:'Use the MySQL schema editor for this connection.' };
        try {
            await con.transaction({ transaction:Transactions.get(conID) }, async (transaction) => {
                for (const statement of statements) await con.query(statement,{ transaction });
            });
            if (Transactions.isOpen(conID)) statements.forEach((sql) => Transactions.record(conID,{ sql,...describeStatement(sql),source:'editor' }));
            return {};
        } catch (err) { return { error:(err as Error).message }; }
    }
    /**
     * Get all the schemas for a db
     * @param conID
     */
    ListDatabases(conID: string): Promise<string[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ListDatabases(con);
    }

    GetSupportedTypes(conID: string): string[] {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            const res: string[] = [];
            return res;
        }
        return this.rnr(con.getDialect()).GetSupportedTypes();
    }

    TruncateTable(conID: string, tableName: string): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return Promise.resolve(busyWithTransaction());
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(new Error('Could not find connection id'));
        }
        return this.rnr(con.getDialect()).TruncateTable(con, tableName);
    }
    DropTable(conID: string, tableName: string): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return Promise.resolve(busyWithTransaction());
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(new Error('Could not find connection id'));
        }
        return this.rnr(con.getDialect()).DropTable(con, tableName);
    }

    /**
     * Switches data bases without changing the connection id
     * @param conID
     * @param dbName
     */
    async SwitchDataBase(conID: string, dbName: string): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return busyWithTransaction();
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(new Error('Could not find connection id'));
        }
        let dbs = await this.ListDatabases(conID);
        if (!dbs.includes(dbName)) {
            return Promise.resolve(
                new Error(`${dbName} was not found for this connection `)
            );
        }
        const newCon = new Sequelize(
            dbName,
            con.config.username,
            con.config.password,
            {
                host: con.config.host,
                port: parseInt(con.config.port),
                dialect: con.getDialect() as Dialect,
                logging: false,
                dialectOptions: (con as any).options?.dialectOptions,
            }
        );

        const err = await waitTillConnection(newCon, 0);
        if (err != null) {
            await newCon.close().catch(() => {});
            return err;
        }

        await this.conMgr.Remove(conID, true);

        // add with specific con id
        this.conMgr.Add(newCon, conID);
        return null;
    }

    /**
     * Create a table
     * @param conID
     * @param tableName
     * @param schema
     */
    CreateTable(
        conID: string,
        tableName: string,
        schema: CreateColSchema[]
    ): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return Promise.resolve(busyWithTransaction());
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).CreateTable(con, tableName, schema);
    }

    /**
     * Select from a table and paginate + filter
     * @param conID
     * @param s
     */
    SelectFromTable(conID: string, s: SelectInput): Promise<ErrorTuple<any[]>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(
                NewErrorTuple([], new Error('no valid connection !'))
            );
        }
        return this.rnr(con.getDialect()).SelectFromTable(con, s, Transactions.get(conID));
    }

    /**
     * Insert generated rows
     * @param conID
     * @param tableName
     * @param columns
     * @param rows
     */
    InsertRows(
        conID: string,
        tableName: string,
        columns: string[],
        rows: any[][],
        ignore = false
    ): Promise<ErrorTuple<number>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(
                NewErrorTuple(0, new Error('no valid connection !'))
            );
        }
        const q = (c: string) => this.rnr(con.getDialect()).QuoteIdent(c);
        const postgres = con.getDialect() === 'postgres';
        const shown = rows.slice(0, 3).map((r) => `(${r.map((v) => this.logValue(con,v)).join(', ')})`);
        const logSQL = postgres && !columns.length
            ? rows.slice(0, 3).map(() => `INSERT INTO ${this.rnr(con.getDialect()).QuoteTable(tableName)} DEFAULT VALUES${ignore ? ' ON CONFLICT DO NOTHING' : ''};`).join('\n')
            : `INSERT ${ignore && !postgres ? 'IGNORE ' : ''}INTO ${this.rnr(con.getDialect()).QuoteTable(tableName)} (${columns.map(q).join(', ')}) VALUES ${shown.join(', ')}${ignore && postgres ? ' ON CONFLICT DO NOTHING' : ''}${
            rows.length > 3 ? ` /* … ${rows.length - 3} more rows */` : ''
        }`;
        return this.rnr(con.getDialect())
            .InsertRows(con, tableName, columns, rows, ignore, Transactions.get(conID))
            .then((res) => this.logGridWrite(conID, res, 'INSERT', tableName, logSQL));
    }

    DeleteRows(
        conID: string,
        tableName: string,
        keys: RowKey[],
        byAllColumns: boolean
    ): Promise<ErrorTuple<number>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(NewErrorTuple(0, new Error('no valid connection !')));
        }
        const logSQL = `DELETE FROM ${this.rnr(con.getDialect()).QuoteTable(tableName)} WHERE ${this.keysForLog(con, keys)}${
            byAllColumns ? ' /* one LIMIT 1 delete per row */' : ''
        }`;
        return this.rnr(con.getDialect())
            .DeleteRows(con, tableName, keys, byAllColumns, Transactions.get(conID))
            .then((res) => this.logGridWrite(conID, res, 'DELETE', tableName, logSQL));
    }

    UpdateRows(
        conID: string,
        tableName: string,
        set: ColumnAssignment[],
        keys: RowKey[],
        byAllColumns: boolean
    ): Promise<ErrorTuple<number>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(NewErrorTuple(0, new Error('no valid connection !')));
        }
        const q = (c: string) => this.rnr(con.getDialect()).QuoteIdent(c);
        const assignments = set
            .map((a: ColumnAssignment) =>
                a.mode === 'null'
                    ? `${q(a.column)} = NULL`
                    : a.mode === 'default'
                    ? `${q(a.column)} = DEFAULT`
                    : a.mode === 'expression'
                    ? `${q(a.column)} = ${a.value}`
                    : `${q(a.column)} = ${this.logValue(con,a.value)}`
            )
            .join(', ');
        const logSQL = `UPDATE ${this.rnr(con.getDialect()).QuoteTable(tableName)} SET ${assignments} WHERE ${this.keysForLog(con, keys)}`;
        return this.rnr(con.getDialect())
            .UpdateRows(con, tableName, set, keys, byAllColumns, Transactions.get(conID))
            .then((res) => this.logGridWrite(conID, res, 'UPDATE', tableName, logSQL));
    }

    /**
     * Count rows of a table matching the filters
     * @param conID
     * @param tableName
     * @param filters
     */
    CountRows(
        conID: string,
        tableName: string,
        filters: Filter[],
        mode: FilterMode = 'AND'
    ): Promise<ErrorTuple<number>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(
                NewErrorTuple(0, new Error('no valid connection !'))
            );
        }
        return this.rnr(con.getDialect()).CountRows(
            con,
            tableName,
            filters,
            mode,
            Transactions.get(conID)
        );
    }

    CloneTable(
        conID: string,
        oldTableName: string,
        newTableName: string,
        mustDuplicateData: boolean = false
    ): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return Promise.resolve(busyWithTransaction());
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).CloneTable(
            con,
            oldTableName,
            newTableName,
            mustDuplicateData
        );
    }

    ShowDDL(conID: string, tableName: string): Promise<string> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).ShowCreateSQL(con, tableName, Transactions.get(conID));
    }

    RenameTable(
        conID: string,
        oldTableName: string,
        newTableName: string
    ): Promise<Error> {
        if (Transactions.isOpen(conID)) {
            return Promise.resolve(busyWithTransaction());
        }
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).RenameTable(
            con,
            oldTableName,
            newTableName
        );
    }
}
