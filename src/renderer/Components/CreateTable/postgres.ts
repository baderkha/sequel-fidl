import type { TableMetadata } from 'main/util/sql_admin_commands';
import { quoteIdentifier, quoteTable, sqlString } from 'shared/db/dialects';
import {
    ColumnDef,
    TableDef,
    TypeInfo,
    Problem,
    autoFkName,
    autoIndexName,
    uid,
} from './model';

const q = (name: string) => quoteIdentifier(name, 'postgres');
const table = (name: string) => quoteTable(name, 'postgres');
const str = (value: string) => sqlString(value, 'postgres');
export const POSTGRES_TYPES: TypeInfo[] = [
    ...['SMALLINT', 'INTEGER', 'BIGINT'].map((name) => ({
        name,
        group: 'Numeric',
        param: 'none' as const,
        numeric: true,
        integer: true,
    })),
    {
        name: 'NUMERIC',
        group: 'Numeric',
        param: 'optional',
        placeholder: '10,2',
        numeric: true,
    },
    ...['REAL', 'DOUBLE PRECISION'].map((name) => ({
        name,
        group: 'Numeric',
        param: 'none' as const,
        numeric: true,
    })),
    { name: 'BOOLEAN', group: 'Other', param: 'none' },
    {
        name: 'VARCHAR',
        group: 'String',
        param: 'optional',
        placeholder: '255',
        textual: true,
    },
    {
        name: 'CHAR',
        group: 'String',
        param: 'optional',
        placeholder: '1',
        textual: true,
    },
    { name: 'TEXT', group: 'String', param: 'none', textual: true },
    ...['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL'].map((name) => ({
        name,
        group: 'Date & Time',
        param: 'none' as const,
    })),
    ...[
        'UUID',
        'JSON',
        'JSONB',
        'BYTEA',
        'TEXT[]',
        'INTEGER[]',
        'NUMERIC[]',
    ].map((name) => ({ name, group: 'Other', param: 'none' as const })),
];
export const postgresTypeInfo = (type: string): TypeInfo =>
    POSTGRES_TYPES.find((t) => t.name === type) || {
        name: type,
        group: 'Other',
        param: 'none',
    };

const typeSQL = (column: ColumnDef) =>
    column.type + (column.param.trim() ? `(${column.param.trim()})` : '');
const defaultSQL = (column: ColumnDef) =>
    column.defaultMode === 'null'
        ? 'NULL'
        : column.defaultMode === 'expression'
        ? column.defaultValue
        : str(column.defaultValue);
const columnSQL = (column: ColumnDef) =>
    `${q(column.name)} ${typeSQL(column)}${
        column.autoIncrement
            ? ` GENERATED ${column.identityMode || 'BY DEFAULT'} AS IDENTITY`
            : column.defaultMode !== 'none'
            ? ` DEFAULT ${defaultSQL(column)}`
            : ''
    }${!column.nullable || column.primaryKey ? ' NOT NULL' : ''}`;
const colNames = (def: TableDef, ids: number[]) =>
    ids
        .map((id) => q(def.columns.find((c) => c.id === id)?.name || '?'))
        .join(', ');
const fkSQL = (def: TableDef, fk: TableDef['foreignKeys'][0]) =>
    `CONSTRAINT ${q(fk.name || autoFkName(def, fk))} FOREIGN KEY (${colNames(
        def,
        fk.columns
    )}) REFERENCES ${table(fk.refTable)} (${fk.refColumns
        .map(q)
        .join(', ')}) ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`;
const indexSQL = (def: TableDef, idx: TableDef['indexes'][0]) =>
    `CREATE ${idx.kind === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX ${q(
        idx.name || autoIndexName(def, idx)
    )} ON ${table(def.name)} (${colNames(def, idx.columns)});`;
const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

export function buildPostgresSQL(def: TableDef): string {
    const definitions = def.columns.map(columnSQL);
    const pk = def.columns.filter((c) => c.primaryKey);
    if (pk.length)
        definitions.push(
            `PRIMARY KEY (${pk.map((c) => q(c.name)).join(', ')})`
        );
    definitions.push(...def.foreignKeys.map((fk) => fkSQL(def, fk)));
    const statements = [
        `CREATE TABLE ${table(def.name)} (\n  ${definitions.join(',\n  ')}\n);`,
        ...def.indexes.map((idx) => indexSQL(def, idx)),
    ];
    if (def.options.comment)
        statements.push(
            `COMMENT ON TABLE ${table(def.name)} IS ${str(
                def.options.comment
            )};`
        );
    def.columns
        .filter((c) => c.comment)
        .forEach((c) =>
            statements.push(
                `COMMENT ON COLUMN ${table(def.name)}.${q(c.name)} IS ${str(
                    c.comment
                )};`
            )
        );
    return statements.join('\n');
}

export function buildPostgresAlter(
    original: TableDef,
    next: TableDef
): string[] {
    const statements: string[] = [];
    const target = table(original.name);
    const alter = (sql: string) =>
        statements.push(`ALTER TABLE ${target} ${sql};`);
    const pkChanged = !same(
        original.columns.filter((c) => c.primaryKey).map((c) => c.id),
        next.columns.filter((c) => c.primaryKey).map((c) => c.id)
    );
    original.foreignKeys
        .filter(
            (old) =>
                !next.foreignKeys.some(
                    (fk) => fk.id === old.id && same(fk, old)
                )
        )
        .forEach((fk) => alter(`DROP CONSTRAINT ${q(fk.origName || fk.name)}`));
    original.indexes
        .filter(
            (old) =>
                !next.indexes.some((idx) => idx.id === old.id && same(idx, old))
        )
        .forEach((idx) => {
            if (idx.constraintName)
                alter(`DROP CONSTRAINT ${q(idx.constraintName)}`);
            else {
                const schema = original.name.includes('.')
                    ? original.name.split('.').slice(0, -1).join('.')
                    : 'public';
                statements.push(
                    `DROP INDEX ${table(
                        `${schema}.${idx.origName || idx.name}`
                    )};`
                );
            }
        });
    if (pkChanged && original.columns.some((c) => c.primaryKey))
        alter(
            `DROP CONSTRAINT ${q(
                original.options.primaryKeyName ||
                    `${original.name.split('.').pop()}_pkey`
            )}`
        );
    original.columns
        .filter((old) => !next.columns.some((c) => c.id === old.id))
        .forEach((c) => alter(`DROP COLUMN ${q(c.name)}`));
    next.columns.forEach((column) => {
        const old = original.columns.find((c) => c.id === column.id);
        if (!old) alter(`ADD COLUMN ${columnSQL(column)}`);
        else if (!column.locked) {
            if (old.name !== column.name)
                alter(`RENAME COLUMN ${q(old.name)} TO ${q(column.name)}`);
            if (typeSQL(old) !== typeSQL(column))
                alter(
                    `ALTER COLUMN ${q(column.name)} TYPE ${typeSQL(
                        column
                    )} USING ${q(column.name)}::${typeSQL(column)}`
                );
            if (
                (old.nullable && !old.primaryKey) !==
                (column.nullable && !column.primaryKey)
            )
                alter(
                    `ALTER COLUMN ${q(column.name)} ${
                        column.nullable && !column.primaryKey ? 'DROP' : 'SET'
                    } NOT NULL`
                );
            if (old.autoIncrement !== column.autoIncrement) {
                if (old.autoIncrement) {
                    if (old.identityMode)
                        alter(
                            `ALTER COLUMN ${q(
                                column.name
                            )} DROP IDENTITY IF EXISTS`
                        );
                    else alter(`ALTER COLUMN ${q(column.name)} DROP DEFAULT`);
                } else {
                    alter(`ALTER COLUMN ${q(column.name)} DROP DEFAULT`);
                    alter(
                        `ALTER COLUMN ${q(
                            column.name
                        )} ADD GENERATED BY DEFAULT AS IDENTITY`
                    );
                }
            }
            if (
                !column.autoIncrement &&
                (old.defaultMode !== column.defaultMode ||
                    old.defaultValue !== column.defaultValue)
            )
                alter(
                    `ALTER COLUMN ${q(column.name)} ${
                        column.defaultMode === 'none'
                            ? 'DROP DEFAULT'
                            : `SET DEFAULT ${defaultSQL(column)}`
                    }`
                );
        }
        if (!old || old.comment !== column.comment)
            statements.push(
                `COMMENT ON COLUMN ${target}.${q(column.name)} IS ${
                    column.comment ? str(column.comment) : 'NULL'
                };`
            );
    });
    if (pkChanged) {
        const pk = next.columns.filter((c) => c.primaryKey);
        if (pk.length)
            alter(`ADD PRIMARY KEY (${pk.map((c) => q(c.name)).join(', ')})`);
    }
    next.indexes
        .filter(
            (idx) =>
                !original.indexes.some(
                    (old) => old.id === idx.id && same(old, idx)
                )
        )
        .forEach((idx) =>
            statements.push(indexSQL({ ...next, name: original.name }, idx))
        );
    next.foreignKeys
        .filter(
            (fk) =>
                !original.foreignKeys.some(
                    (old) => old.id === fk.id && same(old, fk)
                )
        )
        .forEach((fk) => alter(`ADD ${fkSQL(next, fk)}`));
    if (original.options.comment !== next.options.comment)
        statements.push(
            `COMMENT ON TABLE ${target} IS ${
                next.options.comment ? str(next.options.comment) : 'NULL'
            };`
        );
    if (original.name !== next.name)
        alter(`RENAME TO ${q(next.name.split('.').pop())}`);
    return statements;
}

export function validatePostgres(def: TableDef, tables: string[]): Problem[] {
    const out: Problem[] = [];
    const add = (field: string, message: string) =>
        out.push({ tab: 'columns', field, message } as Problem);
    if (!def.name.trim()) add('table:name', 'Table name is required');
    if (tables.includes(def.name) && def.name !== def.origName)
        add('table:name', 'A table with this name already exists');
    const schema = (name: string) =>
        name.includes('.') ? name.split('.').slice(0, -1).join('.') : 'public';
    if (def.origName && schema(def.origName) !== schema(def.name))
        add(
            'table:name',
            'Use ALTER TABLE SET SCHEMA to move a table between schemas'
        );
    if (def.name.split('.').some((part) => !part || BufferLength(part) > 63))
        add('table:name', 'PostgreSQL identifiers must be 1–63 bytes');
    if (!def.columns.length) add('columns', 'Add at least one column');
    const seen = new Set<string>();
    for (const c of def.columns) {
        if (!c.name.trim() || BufferLength(c.name) > 63)
            add(`col:${c.id}:name`, 'Column names must be 1–63 bytes');
        if (seen.has(c.name))
            add(`col:${c.id}:name`, `Duplicate column "${c.name}"`);
        seen.add(c.name);
        if (c.locked) continue;
        if (c.param && !/^\d+(\s*,\s*-?\d+)?$/.test(c.param))
            add(`col:${c.id}:param`, 'Enter a valid length or precision');
        if (
            c.autoIncrement &&
            !['SMALLINT', 'INTEGER', 'BIGINT'].includes(c.type)
        )
            add(`col:${c.id}:ai`, 'Identity columns need an integer type');
        if (c.autoIncrement && c.defaultMode !== 'none')
            add(
                `col:${c.id}:default`,
                'Identity columns cannot also have a default'
            );
        if (c.defaultMode === 'null' && (!c.nullable || c.primaryKey))
            add(
                `col:${c.id}:default`,
                'DEFAULT NULL requires a nullable column'
            );
        if (c.defaultMode === 'expression' && !c.defaultValue.trim())
            add(`col:${c.id}:default`, 'Enter a default expression');
    }
    for (const index of def.indexes) {
        if (!index.columns.length && !index.locked)
            out.push({
                tab: 'indexes',
                field: `idx:${index.id}:columns`,
                message: 'Choose index columns',
            });
    }
    for (const fk of def.foreignKeys) {
        if (
            !fk.refTable ||
            !fk.columns.length ||
            fk.columns.length !== fk.refColumns.length
        )
            out.push({
                tab: 'foreignKeys',
                field: `fk:${fk.id}:columns`,
                message: 'Choose matching local and referenced columns',
            });
    }
    return out;
}
const BufferLength = (text: string) => new Blob([text]).size;

export function postgresTableDef(
    metadata: TableMetadata,
    name: string
): TableDef {
    const columns: ColumnDef[] = metadata.columns.map((c) => {
        let raw = c.Type.toUpperCase()
            .replace(/^CHARACTER VARYING/, 'VARCHAR')
            .replace(/^CHARACTER\b/, 'CHAR')
            .replace(/TIMESTAMP(\(\d+\))? WITH TIME ZONE/, 'TIMESTAMPTZ$1')
            .replace(/ WITHOUT TIME ZONE/, '');
        const param = raw.match(/\(([^)]+)\)/)?.[1] || '';
        raw = raw.replace(/\([^)]+\)/, '');
        if (!POSTGRES_TYPES.some((t) => t.name === raw)) raw = c.Type;
        return {
            id: uid(),
            origName: c.Field,
            name: c.Field,
            type: raw,
            param,
            unsigned: false,
            nullable: c.Null === 'YES',
            primaryKey: c.Key === 'PRI',
            locked: /GENERATED/.test(c.Extra),
            autoIncrement: /auto_increment/.test(c.Extra),
            identityMode: c.Identity
                ? c.Identity === 'a'
                    ? 'ALWAYS'
                    : 'BY DEFAULT'
                : undefined,
            defaultMode:
                c.Default != null && !/auto_increment/.test(c.Extra)
                    ? 'expression'
                    : 'none',
            defaultValue: c.Default || '',
            onUpdateNow: false,
            comment: c.Comment || '',
        };
    });
    const id = (field: string) => columns.find((c) => c.name === field)?.id;
    const byIndex = new Map<string, any[]>();
    metadata.indexes
        .filter((r) => r.Key_name !== 'PRIMARY')
        .forEach((r) =>
            byIndex.set(r.Key_name, [...(byIndex.get(r.Key_name) || []), r])
        );
    const byFK = new Map<string, any[]>();
    metadata.foreignKeys.forEach((r) =>
        byFK.set(r.n, [...(byFK.get(r.n) || []), r])
    );
    return {
        name,
        origName: name,
        columns,
        options: {
            engine: '',
            charset: '',
            collation: '',
            autoIncrementStart: '',
            comment: '',
            ...metadata.options,
        },
        indexes: Array.from(byIndex).map(([key, parts]) => ({
            id: uid(),
            name: key,
            origName: key,
            kind: parts[0].Non_unique ? 'INDEX' : 'UNIQUE',
            columns: parts
                .map((p) => id(p.Column_name))
                .filter((v) => v != null),
            locked: parts.some((p) => !p.Column_name || p.Partial),
            constraintName: parts[0].Constraint_name,
        })),
        foreignKeys: Array.from(byFK).map(([key, parts]) => ({
            id: uid(),
            name: key,
            origName: key,
            columns: parts.map((r) => id(r.c)),
            refTable: parts[0].rt,
            refColumns: parts.map((r) => r.rc),
            onDelete: parts[0].d,
            onUpdate: parts[0].u,
        })),
    };
}
