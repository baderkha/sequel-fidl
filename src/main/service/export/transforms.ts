import { normalizeValue } from './columns';
import { ExportColumn, Row, RowTransform } from './types';

/** driver values → canonical values (always first) */
export function normalize(): RowTransform {
    let kinds: ExportColumn['kind'][] = [];
    return {
        columns(columns) {
            kinds = columns.map((c) => c.kind);
            return columns;
        },
        rows: (rows) => rows.map((r) => r.map((v, i) => normalizeValue(kinds[i], v))),
    };
}

/** keep these columns , in this order (unknown names are ignored) */
export function pickColumns(names: string[]): RowTransform {
    let indexes: number[] = [];
    return {
        columns(columns) {
            indexes = names.map((n) => columns.findIndex((c) => c.name === n)).filter((i) => i >= 0);
            // nothing matched : keep everything rather than writing empty rows
            if (!indexes.length) indexes = columns.map((_, i) => i);
            return indexes.map((i) => columns[i]);
        },
        rows: (rows) => rows.map((r) => indexes.map((i) => r[i])),
    };
}

/** at most n rows */
export function limitRows(n: number): RowTransform {
    let left = Math.max(0, Math.floor(n));
    return {
        columns: (columns) => columns,
        rows(rows) {
            const kept = rows.length <= left ? rows : rows.slice(0, left);
            left -= kept.length;
            return kept;
        },
        done: () => left <= 0,
    };
}

/** apply transforms in order */
export const applyColumns = (transforms: RowTransform[], columns: ExportColumn[]) =>
    transforms.reduce((cols, t) => t.columns(cols), columns);

export const applyRows = (transforms: RowTransform[], rows: Row[]) => transforms.reduce((rs, t) => (rs.length ? t.rows(rs) : rs), rows);
