import { formatDate } from 'renderer/Components/DataGrid/format';
import { ident, str } from 'renderer/Components/CreateTable/model';

export { ident, str };

/** a value as a MySQL literal , for previews and "copy as INSERT" */
export function literal(v: any): string {
    if (v === null || v === undefined) {
        return 'NULL';
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
        return `${v}`;
    }
    if (typeof v === 'boolean') {
        return v ? '1' : '0';
    }
    if (v instanceof Date) {
        return str(formatDate(v));
    }
    if (v instanceof Uint8Array) {
        return v.length ? `0x${Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')}` : "''";
    }
    if (typeof v === 'object') {
        return str(JSON.stringify(v));
    }
    return str(`${v}`);
}

/** mirrors the main process where clause for a group of row keys */
export function keysWhere(keys: Record<string, any>[]): string {
    const cols = Object.keys(keys[0] || {});
    if (cols.length === 1 && keys.every((k) => k[cols[0]] !== null && k[cols[0]] !== undefined)) {
        return `${ident(cols[0])} IN (${keys.map((k) => literal(k[cols[0]])).join(', ')})`;
    }
    return keys
        .map((k) => `(${Object.entries(k).map(([c, v]) => `${ident(c)} <=> ${literal(v)}`).join(' AND ')})`)
        .join(' OR ');
}
