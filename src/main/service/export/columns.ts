import { ColumnKind, ExportColumn } from './types';

/** mysql protocol column types (mysql2 ColumnDefinition.columnType) */
const T = {
    DECIMAL: 0,
    TINY: 1,
    SHORT: 2,
    LONG: 3,
    FLOAT: 4,
    DOUBLE: 5,
    NULL: 6,
    TIMESTAMP: 7,
    LONGLONG: 8,
    INT24: 9,
    DATE: 10,
    TIME: 11,
    DATETIME: 12,
    YEAR: 13,
    NEWDATE: 14,
    VARCHAR: 15,
    BIT: 16,
    TIMESTAMP2: 17,
    DATETIME2: 18,
    TIME2: 19,
    JSON: 245,
    NEWDECIMAL: 246,
    ENUM: 247,
    SET: 248,
    TINY_BLOB: 249,
    MEDIUM_BLOB: 250,
    LONG_BLOB: 251,
    BLOB: 252,
    VAR_STRING: 253,
    STRING: 254,
    GEOMETRY: 255,
};
const UNSIGNED_FLAG = 32;
const BINARY_CHARSET = 63;

/** the bits of a mysql2 field definition we use */
export type DriverField = {
    name: string;
    columnType?: number;
    type?: number;
    flags: number;
    characterSet?: number;
    decimals?: number;
    columnLength?: number;
};

const TYPE_NAMES: Record<number, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

/** column metadata from the driver → what the pipeline works with */
export function columnFromField(f: DriverField): ExportColumn {
    const type = f.columnType ?? f.type ?? T.VAR_STRING;
    const unsigned = (f.flags & UNSIGNED_FLAG) !== 0;
    const binary = f.characterSet === BINARY_CHARSET;
    const decimals = f.decimals ?? 0;
    const length = f.columnLength ?? 0;
    const fsp = decimals > 0 && decimals <= 6 ? decimals : 0;
    const named = (kind: ColumnKind, sqlType: string, extra: Partial<ExportColumn> = {}): ExportColumn => ({
        name: f.name,
        kind,
        sqlType,
        ...extra,
    });
    const u = unsigned ? ' UNSIGNED' : '';
    switch (type) {
        case T.TINY:
            return named('int32', `TINYINT${u}`);
        case T.SHORT:
            return named('int32', `SMALLINT${u}`);
        case T.INT24:
            return named('int32', `MEDIUMINT${u}`);
        case T.YEAR:
            return named('int32', 'YEAR');
        case T.LONG:
            // unsigned INT doesn't fit an int32
            return named(unsigned ? 'int64' : 'int32', `INT${u}`);
        case T.LONGLONG:
            return named(unsigned ? 'uint64' : 'int64', `BIGINT${u}`);
        case T.FLOAT:
            return named('float', 'FLOAT');
        case T.DOUBLE:
            return named('double', 'DOUBLE');
        case T.DECIMAL:
        case T.NEWDECIMAL: {
            // display length = digits + point (when scale) + sign (when signed)
            const scale = Math.min(Math.max(decimals, 0), 30);
            const precision = Math.min(Math.max(length - (scale > 0 ? 1 : 0) - (unsigned ? 0 : 1), scale || 1), 65);
            return named('decimal', `DECIMAL(${precision},${scale})${u}`, { precision, scale });
        }
        case T.BIT:
            return length === 1 ? named('bool', 'BIT(1)') : named('uint64', `BIT(${length})`);
        case T.DATE:
        case T.NEWDATE:
            return named('date', 'DATE');
        case T.DATETIME:
        case T.DATETIME2:
            return named('datetime', fsp ? `DATETIME(${fsp})` : 'DATETIME', { fsp });
        case T.TIMESTAMP:
        case T.TIMESTAMP2:
            return named('datetime', fsp ? `TIMESTAMP(${fsp})` : 'TIMESTAMP', { fsp });
        case T.TIME:
        case T.TIME2:
            return named('time', fsp ? `TIME(${fsp})` : 'TIME', { fsp });
        case T.JSON:
            return named('json', 'JSON');
        case T.GEOMETRY:
            return named('binary', 'GEOMETRY');
        case T.TINY_BLOB:
        case T.MEDIUM_BLOB:
        case T.LONG_BLOB:
        case T.BLOB:
            return binary ? named('binary', 'BLOB') : named('string', 'TEXT');
        case T.VAR_STRING:
        case T.VARCHAR:
        case T.STRING:
        case T.ENUM:
        case T.SET:
            return binary ? named('binary', length ? `VARBINARY(${length})` : 'VARBINARY') : named('string', TYPE_NAMES[type] === 'STRING' ? 'CHAR' : 'VARCHAR');
        default:
            return named('string', TYPE_NAMES[type] || `TYPE ${type}`);
    }
}

const pad = (n: number, w = 2) => `${n}`.padStart(w, '0');
const sqlDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sqlDateTime = (d: Date) =>
    `${sqlDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${d.getMilliseconds() ? `.${pad(d.getMilliseconds(), 3)}` : ''}`;

const bitsToBigInt = (b: Buffer) => b.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

/**
 * Raw driver value → the canonical value of its kind (see Row) ,
 * the source asks the driver for strings where JS numbers would lose precision
 */
export function normalizeValue(kind: ColumnKind, v: unknown): unknown {
    if (v === null || v === undefined) return null;
    switch (kind) {
        case 'int32':
        case 'float':
        case 'double':
            return typeof v === 'number' ? v : Number(v);
        case 'int64':
        case 'uint64':
            if (typeof v === 'bigint') return v;
            if (Buffer.isBuffer(v)) return bitsToBigInt(v);
            return BigInt(typeof v === 'number' ? Math.trunc(v) : `${v}`);
        case 'decimal':
            return `${v}`;
        case 'bool':
            if (Buffer.isBuffer(v)) return v.some((b) => b !== 0);
            return Boolean(Number(v));
        case 'date':
            return v instanceof Date ? sqlDate(v) : `${v}`;
        case 'datetime':
            return v instanceof Date ? sqlDateTime(v) : `${v}`;
        case 'json':
            if (typeof v === 'string') {
                try {
                    return JSON.parse(v);
                } catch (e) {
                    return v;
                }
            }
            return v;
        case 'binary':
            return Buffer.isBuffer(v) ? v : Buffer.from(v instanceof Uint8Array ? v : `${v}`);
        default:
            return Buffer.isBuffer(v) ? v.toString('utf8') : typeof v === 'object' ? JSON.stringify(v) : `${v}`;
    }
}
