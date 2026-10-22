import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import {
    AdminSQLCommand,
    ColSchema,
    ColumnAssignment,
    Filter,
    FilterMode,
    RowKey,
    SelectInput,
    Table,
    TableMetadata,
} from '.';
import { ErrorTuple, NewErrorTuple } from '../tuple';
import { quoteIdentifier, quoteTable } from '../../../shared/db/dialects';

export class PostgresAdminCommand extends AdminSQLCommand {
    QuoteIdent(name: string) {
        return quoteIdentifier(name, 'postgres');
    }
    QuoteTable(name: string) {
        return quoteTable(name, 'postgres');
    }
    NullComparison() {
        return 'IS NOT DISTINCT FROM';
    }

    private async readWithSavepoint<T>(
        con: Sequelize,
        parent: Transaction,
        query: (transaction?: Transaction) => Promise<ErrorTuple<T>>,
        fallback: T
    ): Promise<ErrorTuple<T>> {
        if (!parent) return query();
        try {
            return await con.transaction(
                { transaction: parent },
                async (savepoint) => {
                    const result = await query(savepoint);
                    if (result[1]) throw result[1];
                    return result;
                }
            );
        } catch (error) {
            return NewErrorTuple(fallback, error as Error);
        }
    }

    SelectFromTable(
        con: Sequelize,
        input: SelectInput,
        transaction?: Transaction
    ): Promise<ErrorTuple<any[]>> {
        return this.readWithSavepoint(
            con,
            transaction,
            (savepoint) => super.SelectFromTable(con, input, savepoint),
            []
        );
    }

    CountRows(
        con: Sequelize,
        table: string,
        filters: Filter[],
        mode: FilterMode = 'AND',
        transaction?: Transaction
    ): Promise<ErrorTuple<number>> {
        return this.readWithSavepoint(
            con,
            transaction,
            (savepoint) =>
                super.CountRows(con, table, filters, mode, savepoint),
            0
        );
    }

    private rows(
        con: Sequelize,
        sql: string,
        replacements: unknown[] = [],
        transaction?: Transaction
    ): Promise<any[]> {
        return con.query(sql, {
            replacements,
            type: QueryTypes.SELECT,
            transaction,
        });
    }

    private async metadataQueries(
        queries: (() => Promise<any[]>)[],
        transaction?: Transaction
    ): Promise<any[][]> {
        if (!transaction) return Promise.all(queries.map((query) => query()));
        // A transaction pins one client; don't queue concurrent queries on it.
        const results: any[][] = [];
        for (const query of queries) results.push(await query());
        return results;
    }

    async ShowAllTables(
        con: Sequelize,
        transaction?: Transaction
    ): Promise<Table[]> {
        return this.rows(
            con,
            `SELECT CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS "Name",
            CASE WHEN c.relkind IN ('v','m') THEN 'view' ELSE 'table' END AS "Type"
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema')
              AND n.nspname NOT LIKE 'pg_toast%' AND has_schema_privilege(n.oid, 'USAGE')
            ORDER BY n.nspname, c.relname`,
            [],
            transaction
        );
    }

    async ListDatabases(con: Sequelize): Promise<string[]> {
        const rows = await this.rows(
            con,
            `SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND has_database_privilege(oid, 'CONNECT') ORDER BY datname`
        );
        return rows.map((r) => r.datname);
    }

    GetSupportedTypes(): string[] {
        return [
            'smallint',
            'integer',
            'bigint',
            'numeric',
            'real',
            'double precision',
            'boolean',
            'varchar',
            'char',
            'text',
            'bytea',
            'date',
            'time',
            'timestamp',
            'timestamptz',
            'interval',
            'uuid',
            'json',
            'jsonb',
            'integer[]',
            'text[]',
        ];
    }

    async RenameTable(
        con: Sequelize,
        oldName: string,
        newName: string
    ): Promise<Error> {
        try {
            const oldSchema = oldName.includes('.')
                ? oldName.split('.').slice(0, -1).join('.')
                : 'public';
            if (
                newName.includes('.') &&
                newName.split('.').slice(0, -1).join('.') !== oldSchema
            ) {
                return new Error(
                    'Rename within the same schema; use ALTER TABLE SET SCHEMA to move a table.'
                );
            }
            await con.query(
                `ALTER TABLE ${this.QuoteTable(
                    oldName
                )} RENAME TO ${this.QuoteIdent(newName.split('.').pop())}`
            );
            return null;
        } catch (err) {
            return err as Error;
        }
    }

    async GetTableMetadata(
        con: Sequelize,
        table: string,
        transaction?: Transaction
    ): Promise<TableMetadata> {
        const regclass = this.QuoteTable(table);
        const [columns, indexes, foreignKeys, constraints, relation] =
            await this.metadataQueries(
                [
                    () =>
                        this.rows(
                            con,
                            `SELECT a.attname AS "Field", format_type(a.atttypid, a.atttypmod) AS "Type",
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS "Null", pg_get_expr(d.adbin, d.adrelid) AS "Default",
                CASE WHEN a.attgenerated <> '' THEN 'STORED GENERATED' WHEN a.attidentity <> '' OR pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%' THEN 'auto_increment' ELSE '' END AS "Extra",
                a.attidentity AS "Identity", col_description(a.attrelid,a.attnum) AS "Comment", coll.collname AS "Collation",
                CASE WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=a.attrelid AND i.indisprimary AND a.attnum=ANY(i.indkey)) THEN 'PRI'
                     WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=a.attrelid AND i.indisunique AND i.indnkeyatts=1 AND a.attnum=ANY(i.indkey) AND i.indpred IS NULL) THEN 'UNI' ELSE '' END AS "Key"
                FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
                WHERE a.attrelid=to_regclass(?) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
                            [regclass],
                            transaction
                        ),
                    () =>
                        this.rows(
                            con,
                            `SELECT CASE WHEN i.indisprimary THEN 'PRIMARY' ELSE ic.relname END AS "Key_name",
                NOT i.indisunique AS "Non_unique", am.amname AS "Index_type", ord.ordinality::int AS "Seq_in_index",
                a.attname AS "Column_name", pg_get_indexdef(i.indexrelid, ord.ordinality::int, true) AS "Expression",
                NULL AS "Sub_part", NULL AS "Cardinality", 'YES' AS "Visible", pg_get_indexdef(i.indexrelid) AS "Definition",
                (SELECT c.conname FROM pg_constraint c WHERE c.conindid=i.indexrelid AND c.contype='u' LIMIT 1) AS "Constraint_name", i.indpred IS NOT NULL AS "Partial"
                FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam
                CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY ord(attnum,ordinality)
                LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ord.attnum
                WHERE i.indrelid=to_regclass(?) AND ord.ordinality<=i.indnkeyatts ORDER BY ic.relname,ord.ordinality`,
                            [regclass],
                            transaction
                        ),
                    () =>
                        this.rows(
                            con,
                            `SELECT c.conname n, a.attname c,
                CASE WHEN ns.nspname='public' THEN r.relname ELSE ns.nspname || '.' || r.relname END rt,
                ra.attname rc, CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END d,
                CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END u
                FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace
                CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(attnum,refnum,pos)
                JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
                JOIN pg_attribute ra ON ra.attrelid=c.confrelid AND ra.attnum=k.refnum
                WHERE c.conrelid=to_regclass(?) AND c.contype='f' ORDER BY c.conname,k.pos`,
                            [regclass],
                            transaction
                        ),
                    () =>
                        this.rows(
                            con,
                            `SELECT conname,contype,pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid=to_regclass(?) ORDER BY conname`,
                            [regclass],
                            transaction
                        ),
                    () =>
                        this.rows(
                            con,
                            `SELECT c.relkind, obj_description(c.oid,'pg_class') comment,
                CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END viewdef
                FROM pg_class c WHERE c.oid=to_regclass(?)`,
                            [regclass],
                            transaction
                        ),
                ],
                transaction
            );
        if (!relation.length) throw new Error(`Table ${table} was not found.`);
        let ddl: string;
        if (relation[0].viewdef)
            ddl = `CREATE ${
                relation[0].relkind === 'm' ? 'MATERIALIZED ' : ''
            }VIEW ${regclass} AS\n${relation[0].viewdef}`;
        else {
            const defs = columns.map((c) => {
                const generated = /GENERATED/.test(c.Extra)
                    ? ` GENERATED ALWAYS AS (${c.Default}) STORED`
                    : c.Identity
                    ? ` GENERATED ${
                          c.Identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'
                      } AS IDENTITY`
                    : c.Default !== null
                    ? ` DEFAULT ${c.Default}`
                    : '';
                return `  ${this.QuoteIdent(c.Field)} ${c.Type}${generated}${
                    c.Null === 'NO' ? ' NOT NULL' : ''
                }`;
            });
            defs.push(
                ...constraints.map(
                    (c) =>
                        `  CONSTRAINT ${this.QuoteIdent(c.conname)} ${
                            c.definition
                        }`
                )
            );
            ddl = `CREATE TABLE ${regclass} (\n${defs.join(',\n')}\n);`;
            const seen = new Set<string>();
            indexes.forEach((i) => {
                if (
                    i.Key_name !== 'PRIMARY' &&
                    !constraints.some((c) => c.conname === i.Key_name) &&
                    !seen.has(i.Key_name)
                ) {
                    seen.add(i.Key_name);
                    ddl += `\n${i.Definition};`;
                }
            });
        }
        return {
            columns,
            indexes,
            foreignKeys,
            options: {
                comment: relation[0].comment || '',
                primaryKeyName: constraints.find((c) => c.contype === 'p')
                    ?.conname,
            },
            ddl,
        };
    }

    async ShowSchema(
        con: Sequelize,
        table: string,
        transaction?: Transaction
    ): Promise<ColSchema[]> {
        const metadata = await this.GetTableMetadata(con, table, transaction);
        return metadata.columns.map((c) => ({
            FieldName: c.Field,
            Type: c.Type,
            NullAllowed: c.Null === 'YES',
            Default: c.Default,
            IsPrimaryKey: c.Key === 'PRI',
            IsUnique: c.Key === 'UNI',
            AutoIncrement: /auto_increment/.test(c.Extra),
            Extra: c.Extra,
            JsFriendlyType:
                /^(smallint|integer|bigint|numeric|decimal|real|double)/.test(
                    c.Type
                )
                    ? 'number'
                    : c.Type === 'boolean'
                    ? 'boolean'
                    : 'string',
        }));
    }

    async ShowCreateSQL(
        con: Sequelize,
        table: string,
        transaction?: Transaction
    ): Promise<string> {
        return (await this.GetTableMetadata(con, table, transaction)).ddl;
    }
    ShowCreateTable(con: Sequelize, table: string) {
        return this.ShowCreateSQL(con, table);
    }

    async CloneTable(
        con: Sequelize,
        table: string,
        name: string,
        content = false
    ): Promise<Error> {
        try {
            await con.transaction(async (transaction) => {
                await con.query(
                    `CREATE TABLE ${this.QuoteTable(
                        name
                    )} (LIKE ${this.QuoteTable(
                        table
                    )} INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
                    { transaction }
                );
                const metadata = await this.GetTableMetadata(
                    con,
                    table,
                    transaction
                );
                // LIKE copies a serial default verbatim, which would share the source
                // table's sequence. Convert those defaults to independent identities.
                for (const c of metadata.columns.filter(
                    (col) => /auto_increment/.test(col.Extra) && !col.Identity
                )) {
                    await con.query(
                        `ALTER TABLE ${this.QuoteTable(
                            name
                        )} ALTER COLUMN ${this.QuoteIdent(
                            c.Field
                        )} DROP DEFAULT, ALTER COLUMN ${this.QuoteIdent(
                            c.Field
                        )} ADD GENERATED BY DEFAULT AS IDENTITY`,
                        { transaction }
                    );
                }
                if (content) {
                    const cols = metadata.columns
                        .filter((c) => !/GENERATED/.test(c.Extra))
                        .map((c) => this.QuoteIdent(c.Field))
                        .join(', ');
                    await con.query(
                        `INSERT INTO ${this.QuoteTable(
                            name
                        )} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${cols} FROM ${this.QuoteTable(
                            table
                        )}`,
                        { transaction }
                    );
                    // Identity columns have independent sequences; advance them after copying keys.
                    for (const c of metadata.columns.filter((col) =>
                        /auto_increment/.test(col.Extra)
                    )) {
                        await con.query(
                            `SELECT setval(pg_get_serial_sequence(?, ?), (SELECT MAX(${this.QuoteIdent(
                                c.Field
                            )}) FROM ${this.QuoteTable(
                                name
                            )}), true) WHERE EXISTS(SELECT 1 FROM ${this.QuoteTable(
                                name
                            )})`,
                            {
                                replacements: [this.QuoteTable(name), c.Field],
                                transaction,
                            }
                        );
                    }
                }
            });
            return null;
        } catch (err) {
            return err as Error;
        }
    }

    protected keysWhere(
        keys: RowKey[],
        args: any[],
        jsonColumns = new Set<string>()
    ): string {
        if (!keys.length || !Object.keys(keys[0]).length)
            throw new Error('A row key is required.');
        return keys
            .map(
                (key) =>
                    `(${Object.entries(key)
                        .map(([column, value]) => {
                            if (jsonColumns.has(column)) {
                                if (value === null)
                                    return `(${this.QuoteIdent(
                                        column
                                    )} IS NULL OR ${this.QuoteIdent(
                                        column
                                    )}::jsonb = 'null'::jsonb)`;
                                args.push(JSON.stringify(value));
                                return `${this.QuoteIdent(
                                    column
                                )}::jsonb IS NOT DISTINCT FROM CAST($${
                                    args.length
                                } AS jsonb)`;
                            }
                            const binary = value instanceof Uint8Array;
                            if (
                                value &&
                                typeof value === 'object' &&
                                !(value instanceof Date) &&
                                !binary
                            ) {
                                args.push(JSON.stringify(value));
                                return `to_jsonb(${this.QuoteIdent(
                                    column
                                )}) IS NOT DISTINCT FROM CAST($${
                                    args.length
                                } AS jsonb)`;
                            }
                            args.push(binary ? Buffer.from(value) : value);
                            return `${this.QuoteIdent(
                                column
                            )} IS NOT DISTINCT FROM $${args.length}`;
                        })
                        .join(' AND ')})`
            )
            .join(' OR ');
    }

    async InsertRows(
        con: Sequelize,
        table: string,
        columns: string[],
        rows: any[][],
        ignore = false,
        transaction?: Transaction
    ): Promise<ErrorTuple<number>> {
        if (!rows.length) return NewErrorTuple(0, null);
        try {
            if (!columns.length) {
                const count = await con.transaction(
                    { transaction },
                    async (savepoint) => {
                        let inserted = 0;
                        for (const _row of rows) {
                            const [, affected] = await con.query(
                                `INSERT INTO ${this.QuoteTable(
                                    table
                                )} DEFAULT VALUES${
                                    ignore ? ' ON CONFLICT DO NOTHING' : ''
                                }`,
                                {
                                    type: QueryTypes.INSERT,
                                    transaction: savepoint,
                                }
                            );
                            inserted += Number(affected);
                        }
                        return inserted;
                    }
                );
                return NewErrorTuple(count, null);
            }
            const sql = `INSERT INTO ${this.QuoteTable(table)} (${columns
                .map((c) => this.QuoteIdent(c))
                .join(', ')}) VALUES ${rows
                .map(
                    (_row, r) =>
                        `(${columns
                            .map((_col, c) => `$${r * columns.length + c + 1}`)
                            .join(', ')})`
                )
                .join(', ')}${ignore ? ' ON CONFLICT DO NOTHING' : ''}`;
            const bind = rows
                .flat()
                .map((v) => (v instanceof Uint8Array ? Buffer.from(v) : v));
            // Sequelize INSERT returns [returnedRows, affectedRows], not the raw
            // pg Result object. Reading affectedRows.rowCount reported 0 after
            // successful writes and made Content display a false failure.
            const [, affected] = transaction
                ? await con.transaction({ transaction }, (savepoint) =>
                      con.query(sql, {
                          type: QueryTypes.INSERT,
                          bind,
                          transaction: savepoint,
                      })
                  )
                : await con.query(sql, { type: QueryTypes.INSERT, bind });
            return NewErrorTuple(Number(affected), null);
        } catch (err) {
            return NewErrorTuple(0, err as Error);
        }
    }

    private async write(
        con: Sequelize,
        table: string,
        keys: RowKey[],
        byAll: boolean,
        set?: ColumnAssignment[],
        parent?: Transaction
    ): Promise<ErrorTuple<number>> {
        try {
            const json = await this.rows(
                con,
                `SELECT a.attname FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE a.attrelid=to_regclass(?) AND (a.atttypid IN ('json'::regtype,'jsonb'::regtype) OR t.typbasetype IN ('json'::regtype,'jsonb'::regtype))`,
                [this.QuoteTable(table)],
                parent
            );
            const jsonColumns = new Set<string>(json.map((c) => c.attname));
            const count = await con.transaction(
                { transaction: parent },
                async (transaction) => {
                    let n = 0;
                    const groups = byAll
                        ? keys.map((k) => [k])
                        : Array.from(
                              { length: Math.ceil(keys.length / 500) },
                              (_, i) => keys.slice(i * 500, i * 500 + 500)
                          );
                    for (const group of groups) {
                        const args: any[] = [];
                        const assignments = set
                            ?.map((a) => {
                                const col = this.QuoteIdent(a.column);
                                if (a.mode === 'null') return `${col} = NULL`;
                                if (a.mode === 'default')
                                    return `${col} = DEFAULT`;
                                if (a.mode === 'expression')
                                    return `${col} = ${a.value}`;
                                args.push(
                                    a.value instanceof Uint8Array
                                        ? Buffer.from(a.value)
                                        : a.value
                                );
                                return `${col} = $${args.length}`;
                            })
                            .join(', ');
                        const where = this.keysWhere(group, args, jsonColumns);
                        const target = this.QuoteTable(table);
                        const match = byAll
                            ? `(tableoid,ctid) IN (SELECT tableoid,ctid FROM ${target} WHERE ${where} LIMIT 1 FOR UPDATE)`
                            : where;
                        const [, result]: any = await con.query(
                            `${
                                set
                                    ? `UPDATE ${target} SET ${assignments}`
                                    : `DELETE FROM ${target}`
                            } WHERE ${match}`,
                            { bind: args, transaction }
                        );
                        n += Number(result.rowCount) || 0;
                    }
                    return n;
                }
            );
            return NewErrorTuple(count, null);
        } catch (err) {
            return NewErrorTuple(0, err as Error);
        }
    }
    UpdateRows(
        con: Sequelize,
        table: string,
        set: ColumnAssignment[],
        keys: RowKey[],
        byAll: boolean,
        parent?: Transaction
    ) {
        return this.write(con, table, keys, byAll, set, parent);
    }
    DeleteRows(
        con: Sequelize,
        table: string,
        keys: RowKey[],
        byAll: boolean,
        parent?: Transaction
    ) {
        return this.write(con, table, keys, byAll, undefined, parent);
    }
}
