import type { ColSchema, ColumnAssignment } from 'renderer/api';
import { cellToText } from 'renderer/Components/DataGrid/format';

export type DocumentValue = null | boolean | number | string | DocumentValue[] | { [key: string]: DocumentValue };
export type RecordDocument = { [key: string]: DocumentValue };

export const isJSONColumn = (column?: ColSchema) => /^jsonb?\b/i.test(column?.Type || '');

export function binaryBytes(value: any): Uint8Array | null {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
    return null;
}

export function readOnlyField(value: any, column?: ColSchema): boolean {
    if (binaryBytes(value) || /\b(?:VIRTUAL|STORED) GENERATED\b/i.test(column?.Extra || '')) return true;
    return isJSONColumn(column) && containsUnsafeNumber(value);
}

function containsUnsafeNumber(value: any): boolean {
    if (typeof value === 'number') return !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value));
    if (value && typeof value === 'object') return Object.values(value).some(containsUnsafeNumber);
    return false;
}

function documentValue(value: any, column?: ColSchema): DocumentValue {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
        const text = cellToText(value, column?.Type);
        return !/^date\b/i.test(column?.Type || '') && value.getUTCMilliseconds()
            ? `${text}.${String(value.getUTCMilliseconds()).padStart(3, '0')}`
            : text;
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' && containsUnsafeNumber(value)) return value.toString();
    const bytes = binaryBytes(value);
    if (bytes) return { $binary: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') };
    // mysql2 already decodes JSON columns. A string here is a JSON string value,
    // even when its contents happen to look like another JSON document.
    if (Array.isArray(value)) return value.map((v) => documentValue(v));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, documentValue(v)]));
    return value;
}

export const toRecordDocument = (row: Record<string, any>, schema: ColSchema[]): RecordDocument =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, documentValue(value, schema.find((c) => c.FieldName === key))]));

export function parseDocumentJSON(text: string): DocumentValue {
    return JSON.parse(text, (_key, value) => {
        if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
            throw new Error('Use a quoted string for numbers outside the safe integer range.');
        }
        return value;
    });
}

function canonical(value: DocumentValue): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}

/** SQL rows keep their columns; only changed values are sent back to the server. */
export function recordAssignments(row: Record<string, any>, schema: ColSchema[], next: DocumentValue): ColumnAssignment[] {
    if (!next || Array.isArray(next) || typeof next !== 'object') throw new Error('A record must be a JSON object.');
    const before = toRecordDocument(row, schema);
    for (const key of Object.keys(next)) {
        if (!Object.prototype.hasOwnProperty.call(before, key)) throw new Error(`Unknown column "${key}".`);
    }
    return Object.keys(before).flatMap((key): ColumnAssignment[] => {
        if (!Object.prototype.hasOwnProperty.call(next, key)) throw new Error(`Keep column "${key}" in the record. Use null to clear a nullable value.`);
        if (canonical(before[key]) === canonical(next[key])) return [];
        const column = schema.find((c) => c.FieldName === key);
        if (readOnlyField(row[key], column)) throw new Error(`Column "${key}" is read only.`);
        const value = next[key];
        if (value === null) {
            if (column && !column.NullAllowed) throw new Error(`Column "${key}" does not allow NULL.`);
            return [{ column: key, mode: 'null' }];
        }
        if (isJSONColumn(column)) return [{ column: key, mode: 'value', value: JSON.stringify(value) }];
        if (/\[\]$/.test(column?.Type || '') && Array.isArray(value)) return [{ column: key, mode: 'value', value }];
        if (typeof value === 'object') throw new Error(`Column "${key}" expects a scalar value, not an object or array.`);
        return [{ column: key, mode: 'value', value }];
    });
}

export function describeValue(value: DocumentValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array · ${value.length.toLocaleString()} item${value.length === 1 ? '' : 's'}`;
    switch (typeof value) {
        case 'object': {
            const count = Object.keys(value).length;
            return `object · ${count.toLocaleString()} field${count === 1 ? '' : 's'}`;
        }
        case 'string': return `string · ${value.length.toLocaleString()} character${value.length === 1 ? '' : 's'}`;
        case 'number': return Number.isInteger(value) ? 'number · integer' : 'number · decimal';
        default: return typeof value;
    }
}
