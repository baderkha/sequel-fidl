import { formatDate } from 'renderer/Components/DataGrid/format';
import { DatabaseType, quoteIdentifier, quoteTable, sqlString, nullComparison } from 'shared/db/dialects';
const ident = (name: string) => quoteIdentifier(name);
const str = (value: string) => sqlString(value);

export { ident, str };

/** a value as a MySQL literal , for previews and "copy as INSERT" */
export function literal(v: any, dialect: DatabaseType = 'mysql'): string {
    const str = (value: string) => sqlString(value, dialect);
    if (v === null || v === undefined) {
        return 'NULL';
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
        return `${v}`;
    }
    if (typeof v === 'boolean') {
        return dialect === 'postgres' ? (v ? 'TRUE' : 'FALSE') : (v ? '1' : '0');
    }
    if (v instanceof Date) {
        return str(formatDate(v));
    }
    if (v instanceof Uint8Array) {
        if (dialect === 'postgres') return `decode('${Array.from(v, (b) => b.toString(16).padStart(2,'0')).join('')}', 'hex')`;
        return v.length ? `0x${Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')}` : "''";
    }
    if (dialect === 'postgres' && Array.isArray(v)) return v.length ? `ARRAY[${v.map((item) => literal(item,dialect)).join(', ')}]` : "'{}'";
    if (typeof v === 'object') {
        return str(JSON.stringify(v));
    }
    return str(`${v}`);
}

/** mirrors the main process where clause for a group of row keys */
export function keysWhere(keys: Record<string, any>[], dialect: DatabaseType = 'mysql', jsonColumns: string[] = []): string {
    const ident = (name: string) => quoteIdentifier(name,dialect);
    const literalValue = (value: any) => literal(value,dialect);
    const cols = Object.keys(keys[0] || {});
    if (dialect === 'mysql' && cols.length === 1 && keys.every((k) => k[cols[0]] !== null && k[cols[0]] !== undefined)) {
        return `${ident(cols[0])} IN (${keys.map((k) => literalValue(k[cols[0]])).join(', ')})`;
    }
    return keys
        .map((k) => `(${Object.entries(k).map(([c, v]) => {
            if (dialect === 'postgres' && jsonColumns.includes(c)) return v === null ? `(${ident(c)} IS NULL OR ${ident(c)}::jsonb = 'null'::jsonb)` : `${ident(c)}::jsonb IS NOT DISTINCT FROM CAST(${literalValue(JSON.stringify(v))} AS jsonb)`;
            return dialect === 'postgres' && v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Uint8Array) ? `to_jsonb(${ident(c)}) IS NOT DISTINCT FROM CAST(${literalValue(JSON.stringify(v))} AS jsonb)` : `${ident(c)} ${nullComparison(dialect)} ${literalValue(v)}`;
        }).join(' AND ')})`)
        .join(' OR ');
}

export const sqlFor = (dialect: DatabaseType = 'mysql', jsonColumns: string[] = []) => ({
    ident: (name: string) => quoteIdentifier(name,dialect),
    table: (name: string) => quoteTable(name,dialect),
    str: (value: string) => sqlString(value,dialect),
    literal: (value: any) => literal(value,dialect),
    keysWhere: (keys: Record<string,any>[]) => keysWhere(keys,dialect,jsonColumns),
});
