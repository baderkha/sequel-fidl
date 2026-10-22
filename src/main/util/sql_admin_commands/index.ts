import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { ErrorTuple, NewErrorTuple } from '../tuple';

export type FilterOperations =
    | '>'
    | '<'
    | '>='
    | '<='
    | '<>'
    | '='
    | 'LIKE'
    | 'NOT LIKE'
    | 'IS NULL'
    | 'IS NOT NULL'
    | 'IN'
    | 'NOT IN'
    | 'BETWEEN';

/** how filters combine */
export type FilterMode = 'AND' | 'OR';

/**
 * Table Type
 */
export type Table = {
    Name: string;
    Type: 'table' | 'view';
};

/** Dialect-neutral metadata consumed by structure, table editing and seeding. */
export type TableMetadata = {
    columns: any[];
    indexes: any[];
    foreignKeys: any[];
    options: Record<string, any>;
    ddl: string;
};

/**
 * For Viewing on the client side , it also provides js friendly type
 */
export type ColSchema = CreateColSchema & {
    JsFriendlyType: string;
    /** filled by the server (auto_increment) */
    AutoIncrement?: boolean;
    /** has a unique index */
    IsUnique?: boolean;
    /** raw extra info , e.g. "VIRTUAL GENERATED" , "DEFAULT_GENERATED" */
    Extra?: string;
};

/**
 * Create col schema , used to create a table
 */
export type CreateColSchema = {
    FieldName: string;
    Type: string;
    NullAllowed: boolean;
    Default: any;
    IsPrimaryKey: boolean;
};

export type Filter = {
    Column: string;
    Operation: FilterOperations;
    Value: any;
};

export type SortDirection = 'ASC' | 'DESC';

/** identifies one row : primary key values , or every column when the table has no key */
export type RowKey = Record<string, any>;

/** one assignment of a bulk update */
export type ColumnAssignment = {
    column: string;
    mode: 'value' | 'null' | 'default' | 'expression';
    value?: any;
};

/** values that went through ipc come back as Uint8Array , the driver wants Buffers */
const toDriver = (v: any) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v);

const ROW_CHUNK = 500;

export type SelectInput = {
    tableName: string;
    limit: number;
    offset: number;
    orderByCol: string;
    orderDir?: SortDirection;
    extraFilters: Filter[];
    /** AND (all) by default */
    filterMode?: FilterMode;
};

/** a whole (filtered , sorted) table , for exports */
export type TableQuery = {
    tableName: string;
    /** all when empty */
    columns?: string[];
    filters?: Filter[];
    filterMode?: FilterMode;
    orderByCol?: string;
    orderDir?: SortDirection;
    limit?: number;
    offset?: number;
};

const FILTER_OPERATIONS: FilterOperations[] = [
    '>',
    '<',
    '>=',
    '<=',
    '<>',
    '=',
    'LIKE',
    'NOT LIKE',
    'IS NULL',
    'IS NOT NULL',
    'IN',
    'NOT IN',
    'BETWEEN',
];

export abstract class AdminSQLCommand {
    async GetTableMetadata(con: Sequelize, table: string, transaction?: Transaction): Promise<TableMetadata> {
        const query = (sql: string) => con.query(sql, { type: QueryTypes.SELECT, transaction }) as Promise<any[]>;
        const name = con.escape(table);
        const options = await query(`SELECT ENGINE engine, TABLE_COLLATION collation, TABLE_COMMENT comment, TABLE_TYPE type FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`);
        const view = options[0]?.type === 'VIEW';
        const [columns, indexes, foreignKeys, ddl] = await Promise.all([
            query(`SHOW FULL COLUMNS FROM ${this.QuoteIdent(table)}`),
            view ? Promise.resolve([]) : query(`SHOW INDEX FROM ${this.QuoteIdent(table)}`),
            view ? Promise.resolve([]) : query(`SELECT k.CONSTRAINT_NAME n, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt,
                k.REFERENCED_COLUMN_NAME rc, r.UPDATE_RULE u, r.DELETE_RULE d
                FROM information_schema.KEY_COLUMN_USAGE k
                JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
                WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = ${name} AND k.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION`),
            this.ShowCreateSQL(con, table),
        ]);
        return { columns, indexes, foreignKeys, options: options[0] || {}, ddl };
    }

    QuoteTable(name: string): string { return this.QuoteIdent(name); }
    NullComparison(): string { return '<=>'; }
    abstract RenameTable(
        con: Sequelize,
        oldTableName: string,
        newTableName: string
    ): Promise<Error>;
    abstract ShowCreateTable(
        con: Sequelize,
        tableName: string
    ): Promise<string>;
    abstract ShowAllTables(con: Sequelize, transaction?: Transaction): Promise<Table[]>;
    abstract ShowCreateSQL(con: Sequelize, tableName: string, transaction?: Transaction): Promise<string>;
    abstract ShowSchema(
        con: Sequelize,
        tableName: string,
        transaction?: Transaction
    ): Promise<ColSchema[]>;
    abstract ListDatabases(con: Sequelize): Promise<string[]>;
    abstract GetSupportedTypes(): string[];

    /**
     * Quote an identifier (table / column name) so it can be safely interpolated
     * @param name
     */
    QuoteIdent(name: string): string {
        return '`' + `${name}`.replace(/`/g, '``') + '`';
    }

    TruncateTable(con: Sequelize, tableName: string): Promise<Error> {
        return con
            .query(`TRUNCATE TABLE ${this.QuoteTable(tableName)}`)
            .then(() => null)
            .catch((err) => err as Error);
    }

    DropTable(con: Sequelize, tableName: string): Promise<Error> {
        return con
            .query(`DROP TABLE ${this.QuoteTable(tableName)}`)
            .then(() => null)
            .catch((err) => err as Error);
    }

    CreateTable(
        con: Sequelize,
        tableName: string,
        schema: CreateColSchema[]
    ): Promise<Error> {
        const pks = schema
            .filter((val) => val.IsPrimaryKey)
            .map((val) => val.FieldName);
        const schemaOut = schema.map(
            (val) =>
                `${val.FieldName} ${val.Type.toUpperCase()} ${
                    val.NullAllowed ? 'NULL' : 'NOT NULL'
                } ${val.Default}`
        );

        return con
            .query(
                `CREATE TABLE ${tableName}(
                ${schemaOut.join(',\n')}
                ${
                    pks.length > 0
                        ? ',\nprimary key (' + pks.join(' , ') + ')'
                        : ''
                }
            );`
            )
            .then(() => null)
            .catch((err) => err);
    }

    async CloneTable(
        con: Sequelize,
        tableName: string,
        duplicateName: string,
        duplicateContent: boolean = false
    ): Promise<Error> {
        const t = await con.transaction();
        let err_: Error;
        try {
            await con.query(
                `CREATE TABLE ${this.QuoteIdent(
                    duplicateName
                )} LIKE ${this.QuoteTable(tableName)}`,
                {
                    transaction: t,
                }
            );
            if (duplicateContent) {
                await con.query(
                    `INSERT INTO ${this.QuoteIdent(
                        duplicateName
                    )} SELECT * FROM ${this.QuoteTable(tableName)}`,
                    {
                        transaction: t,
                    }
                );
            }
            await t.commit();
        } catch (err) {
            err_ = err as Error;
            await t.rollback();
        }

        return err_;
    }

    /**
     * Build the where clause + replacement args for a list of filters
     * @param filters
     * @param mode AND => every filter must match , OR => any
     */
    protected buildWhere(filters: Filter[], mode: FilterMode = 'AND'): [string, any[]] {
        const args: any[] = [];
        const clauses = (filters || [])
            .filter((f) => FILTER_OPERATIONS.includes(f.Operation))
            .map((f) => {
                const col = this.QuoteIdent(f.Column);
                switch (f.Operation) {
                    case 'IS NULL':
                    case 'IS NOT NULL':
                        return `${col} ${f.Operation}`;
                    case 'IN':
                    case 'NOT IN':
                        args.push(
                            Array.isArray(f.Value)
                                ? f.Value
                                : `${f.Value}`.split(',').map((v) => v.trim())
                        );
                        return `${col} ${f.Operation} (?)`;
                    case 'BETWEEN': {
                        const [from, to] = Array.isArray(f.Value) ? f.Value : [f.Value, f.Value];
                        args.push(from, to);
                        return `${col} BETWEEN ? AND ?`;
                    }
                    default:
                        args.push(f.Value);
                        return `${col} ${f.Operation} ?`;
                }
            });
        const glue = mode === 'OR' ? ' OR ' : ' AND ';
        return [clauses.length ? `WHERE ${clauses.join(glue)}` : '', args];
    }

    /**
     * Select from a table , paginated , sorted and filtered
     * @param con
     * @param s
     */
    /**
     * SELECT [columns] FROM table WHERE <filters> ORDER BY .. [LIMIT ..] , parameterized (? placeholders)
     * @param s
     */
    BuildSelect(s: TableQuery): [string, any[]] {
        const cols = s.columns && s.columns.length ? s.columns.map((c) => this.QuoteIdent(c)).join(', ') : '*';
        const [where, args] = this.buildWhere(s.filters || [], s.filterMode);
        const order = s.orderByCol
            ? ` ORDER BY ${this.QuoteIdent(s.orderByCol)} ${s.orderDir === 'DESC' ? 'DESC' : 'ASC'}`
            : '';
        const limit =
            s.limit !== undefined && s.limit !== null
                ? ` LIMIT ${Math.max(0, Math.floor(s.limit) || 0)}${s.offset ? ` OFFSET ${Math.max(0, Math.floor(s.offset))}` : ''}`
                : '';
        return [`SELECT ${cols} FROM ${this.QuoteTable(s.tableName)}${where ? ` ${where}` : ''}${order}${limit}`, args];
    }

    /** SELECT COUNT(*) with the same filters as BuildSelect */
    BuildCount(tableName: string, filters: Filter[] = [], mode: FilterMode = 'AND'): [string, any[]] {
        const [where, args] = this.buildWhere(filters, mode);
        return [`SELECT COUNT(*) AS total FROM ${this.QuoteTable(tableName)}${where ? ` ${where}` : ''}`, args];
    }

    SelectFromTable(
        con: Sequelize,
        s: SelectInput,
        transaction?: Transaction
    ): Promise<ErrorTuple<any[]>> {
        const [sql, args] = this.BuildSelect({
            tableName: s.tableName,
            filters: s.extraFilters,
            filterMode: s.filterMode,
            orderByCol: s.orderByCol,
            orderDir: s.orderDir,
            limit: Math.max(1, Math.floor(s.limit) || 20),
            offset: Math.max(0, Math.floor(s.offset) || 0),
        });
        return con
            .query(
                sql,
                {
                    replacements: args,
                    type: QueryTypes.SELECT,
                    transaction,
                }
            )
            .then((rows) => NewErrorTuple(rows as any[], null))
            .catch((err) => NewErrorTuple([], err as Error));
    }

    /**
     * Insert many rows in one statement (parameterized)
     * @param con
     * @param tableName
     * @param columns
     * @param rows values in column order
     * @param ignore INSERT IGNORE , skip rows that hit a unique key
     */
    InsertRows(
        con: Sequelize,
        tableName: string,
        columns: string[],
        rows: any[][],
        ignore = false,
        transaction?: Transaction
    ): Promise<ErrorTuple<number>> {
        if (!rows.length) {
            return Promise.resolve(NewErrorTuple(0, null));
        }
        const tuple = `(${columns.map(() => '?').join(', ')})`;
        const sql = `INSERT ${ignore ? 'IGNORE ' : ''}INTO ${this.QuoteTable(tableName)} (${columns
            .map((c) => this.QuoteIdent(c))
            .join(', ')}) VALUES ${rows.map(() => tuple).join(', ')}`;
        return con
            .query(sql, { replacements: rows.flat().map(toDriver), type: QueryTypes.INSERT, transaction })
            .then((res: any) => NewErrorTuple(Number(res?.[1]) || rows.length, null))
            .catch((err) => NewErrorTuple(0, err as Error));
    }

    /**
     * where clause matching a group of rows : `id IN (...)` for a single non null key ,
     * otherwise null safe `(a <=> ? AND b <=> ?) OR ...`
     */
    protected keysWhere(keys: RowKey[], args: any[]): string {
        const cols = Object.keys(keys[0] || {});
        if (cols.length === 1 && keys.every((k) => k[cols[0]] !== null && k[cols[0]] !== undefined)) {
            args.push(keys.map((k) => toDriver(k[cols[0]])));
            return `${this.QuoteIdent(cols[0])} IN (?)`;
        }
        return keys.map((k) => this.rowMatch(k, args)).join(' OR ');
    }

    /** `(a <=> ? AND b <=> ?)` , null safe so NULL keys match */
    protected rowMatch(key: RowKey, args: any[]): string {
        return `(${Object.entries(key)
            .map(([col, v]) => {
                args.push(toDriver(v));
                return `${this.QuoteIdent(col)} ${this.NullComparison()} ?`;
            })
            .join(' AND ')})`;
    }

    /**
     * Delete rows in one transaction
     * @param con
     * @param tableName
     * @param keys one per row
     * @param byAllColumns keys are full rows (no primary key) , delete one match per row
     */
    async DeleteRows(
        con: Sequelize,
        tableName: string,
        keys: RowKey[],
        byAllColumns: boolean,
        parent?: Transaction
    ): Promise<ErrorTuple<number>> {
        const table = this.QuoteTable(tableName);
        try {
            // inside an open session transaction this becomes a savepoint
            const affected = await con.transaction({ transaction: parent }, async (transaction) => {
                let n = 0;
                const groups = byAllColumns
                    ? keys.map((k) => [k])
                    : Array.from({ length: Math.ceil(keys.length / ROW_CHUNK) }, (_, i) =>
                          keys.slice(i * ROW_CHUNK, (i + 1) * ROW_CHUNK)
                      );
                for (const group of groups) {
                    const args: any[] = [];
                    const where = this.keysWhere(group, args);
                    // eslint-disable-next-line no-await-in-loop
                    const [res]: any = await con.query(
                        `DELETE FROM ${table} WHERE ${where}${byAllColumns ? ' LIMIT 1' : ''}`,
                        { replacements: args, transaction }
                    );
                    n += Number(res?.affectedRows) || 0;
                }
                return n;
            });
            return NewErrorTuple(affected, null);
        } catch (err) {
            return NewErrorTuple(0, err as Error);
        }
    }

    /**
     * Apply the same assignments to many rows in one transaction
     * @param con
     * @param tableName
     * @param set
     * @param keys
     * @param byAllColumns
     */
    async UpdateRows(
        con: Sequelize,
        tableName: string,
        set: ColumnAssignment[],
        keys: RowKey[],
        byAllColumns: boolean,
        parent?: Transaction
    ): Promise<ErrorTuple<number>> {
        const table = this.QuoteTable(tableName);
        try {
            // inside an open session transaction this becomes a savepoint
            const affected = await con.transaction({ transaction: parent }, async (transaction) => {
                let n = 0;
                const groups = byAllColumns
                    ? keys.map((k) => [k])
                    : Array.from({ length: Math.ceil(keys.length / ROW_CHUNK) }, (_, i) =>
                          keys.slice(i * ROW_CHUNK, (i + 1) * ROW_CHUNK)
                      );
                for (const group of groups) {
                    const args: any[] = [];
                    const assignments = set
                        .map((a) => {
                            const col = this.QuoteIdent(a.column);
                            switch (a.mode) {
                                case 'null':
                                    return `${col} = NULL`;
                                case 'default':
                                    return `${col} = DEFAULT`;
                                case 'expression':
                                    return `${col} = ${a.value}`;
                                default:
                                    args.push(toDriver(a.value));
                                    return `${col} = ?`;
                            }
                        })
                        .join(', ');
                    const where = this.keysWhere(group, args);
                    // eslint-disable-next-line no-await-in-loop
                    const [res]: any = await con.query(
                        `UPDATE ${table} SET ${assignments} WHERE ${where}${byAllColumns ? ' LIMIT 1' : ''}`,
                        { replacements: args, transaction }
                    );
                    n += Number(res?.affectedRows) || 0;
                }
                return n;
            });
            return NewErrorTuple(affected, null);
        } catch (err) {
            return NewErrorTuple(0, err as Error);
        }
    }

    /**
     * Count the rows of a table matching the filters
     * @param con
     * @param tableName
     * @param filters
     */
    CountRows(
        con: Sequelize,
        tableName: string,
        filters: Filter[],
        mode: FilterMode = 'AND',
        transaction?: Transaction
    ): Promise<ErrorTuple<number>> {
        const [where, args] = this.buildWhere(filters, mode);
        return con
            .query(
                `SELECT COUNT(*) AS total FROM ${this.QuoteTable(
                    tableName
                )} ${where}`,
                {
                    replacements: args,
                    type: QueryTypes.SELECT,
                    transaction,
                }
            )
            .then((rows) =>
                NewErrorTuple(Number((rows[0] as any).total), null)
            )
            .catch((err) => NewErrorTuple(0, err as Error));
    }
}
