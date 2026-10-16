export type CellKind = 'normal' | 'null' | 'muted';

const pad = (n: number) => `${n}`.padStart(2, '0');

/**
 * The driver reads DATETIME / TIMESTAMP as UTC (sequelize timezone +00:00) , so the UTC
 * fields are the value stored in the column , show those (not the local time)
 */
export const formatDate = (d: Date, dateOnly = false) => {
    if (Number.isNaN(d.getTime())) {
        return 'Invalid date';
    }
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (dateOnly) {
        return date;
    }
    return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
        d.getUTCSeconds()
    )}`;
};

const asBytes = (v: any): Uint8Array | null => {
    if (v instanceof Uint8Array) {
        return v;
    }
    if (v instanceof ArrayBuffer) {
        return new Uint8Array(v);
    }
    // a node buffer that went through JSON
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) {
        return Uint8Array.from(v.data);
    }
    return null;
};

const formatBytes = (n: number) =>
    n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;

const isDateOnlyType = (typeLabel?: string) =>
    !!typeLabel && /^date\b/i.test(typeLabel);

/**
 * Text to show in a grid cell
 * @param value raw value from the driver
 * @param typeLabel the sql column type , used to tell DATE from DATETIME
 */
export function formatCell(
    value: any,
    typeLabel?: string
): { text: string; kind: CellKind } {
    if (value === null || value === undefined) {
        return { text: 'NULL', kind: 'null' };
    }
    if (value instanceof Date) {
        return { text: formatDate(value, isDateOnlyType(typeLabel)), kind: 'normal' };
    }
    const bytes = asBytes(value);
    if (bytes) {
        if (bytes.length <= 32) {
            const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
            return { text: `0x${hex.join('').toUpperCase()}`, kind: 'muted' };
        }
        return { text: `(binary ${formatBytes(bytes.length)})`, kind: 'muted' };
    }
    if (typeof value === 'object') {
        return { text: JSON.stringify(value), kind: 'normal' };
    }
    if (typeof value === 'string') {
        return { text: value.replace(/\r?\n/g, ' ↵ '), kind: 'normal' };
    }
    return { text: `${value}`, kind: 'normal' };
}

/**
 * Full value as text , used for copy and the value viewer
 * @param value
 * @param typeLabel
 * @param pretty pretty print json
 */
export function cellToText(value: any, typeLabel?: string, pretty = false): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        if (pretty && /^\s*[[{]/.test(value)) {
            try {
                return JSON.stringify(JSON.parse(value), null, 2);
            } catch (e) {}
        }
        return value;
    }
    if (typeof value === 'object' && !(value instanceof Date) && !asBytes(value)) {
        return JSON.stringify(value, null, pretty ? 2 : undefined);
    }
    return formatCell(value, typeLabel).text;
}

export const isNumericValue = (v: any) =>
    typeof v === 'number' || typeof v === 'bigint';

/**
 * Sort comparator , nulls always sink to the bottom
 */
export function compareValues(a: any, b: any): number {
    const aNull = a === null || a === undefined;
    const bNull = b === null || b === undefined;
    if (aNull || bNull) {
        return aNull === bNull ? 0 : aNull ? 1 : -1;
    }
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    if (isNumericValue(a) && isNumericValue(b)) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    return `${a}`.localeCompare(`${b}`, undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}
