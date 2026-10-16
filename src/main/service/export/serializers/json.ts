import {
    ByteSink,
    ChunkPolicy,
    ExportColumn,
    JsonLinesOptions,
    JsonOptions,
    JsonValueOptions,
    Row,
    Serializer,
    SerializerWriter,
} from '../types';
import { binaryText, dateValue, uniqueNames } from './values';

const VALUE_DEFAULTS: JsonValueOptions = {
    int64: 'auto',
    decimals: 'string',
    dates: 'iso',
    binary: 'base64',
    nulls: 'keep',
};
export const JSON_DEFAULTS: JsonOptions = { ...VALUE_DEFAULTS, pretty: true, shape: 'objects' };
export const JSONL_DEFAULTS: JsonLinesOptions = { ...VALUE_DEFAULTS };

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** canonical value → JSON value , per the options */
export function jsonValue(v: unknown, c: ExportColumn, o: JsonValueOptions): unknown {
    if (v === null) return null;
    switch (c.kind) {
        case 'int32':
        case 'float':
        case 'double':
            return Number.isFinite(v as number) ? v : null;
        case 'int64':
        case 'uint64': {
            const b = v as bigint;
            if (o.int64 === 'string') return b.toString();
            if (o.int64 === 'number') return Number(b);
            return b <= MAX_SAFE && b >= -MAX_SAFE ? Number(b) : b.toString();
        }
        case 'decimal':
            return o.decimals === 'number' ? Number(v) : v;
        case 'date':
        case 'datetime':
            return dateValue(v as string, o.dates);
        case 'binary':
            return binaryText(v as Buffer, o.binary);
        default:
            return v;
    }
}

/** row → object (or array) of JSON values */
function rowEncoder(columns: ExportColumn[], o: JsonValueOptions) {
    const names = uniqueNames(columns);
    return {
        object(r: Row) {
            const obj: Record<string, unknown> = {};
            r.forEach((v, i) => {
                const j = jsonValue(v, columns[i], o);
                if (j !== null || o.nulls === 'keep') obj[names[i]] = j;
            });
            return obj;
        },
        array: (r: Row) => r.map((v, i) => jsonValue(v, columns[i], o)),
    };
}

const indent = (s: string, by: string) => s.replace(/\n/g, `\n${by}`);

/** one JSON document : an array of objects , or {columns , rows} */
export class JsonSerializer implements Serializer<JsonOptions> {
    readonly id = 'json';
    readonly label = 'JSON';
    readonly extension = '.json';
    readonly streamCompressible = true;
    readonly defaults = JSON_DEFAULTS;
    /** one document has to be parsed whole , keep each file loadable */
    readonly defaultChunk: ChunkPolicy = { by: 'bytes', bytes: 256 * 1024 * 1024 };

    async open(columns: ExportColumn[], options: JsonOptions, sink: ByteSink): Promise<SerializerWriter> {
        const o = { ...JSON_DEFAULTS, ...options };
        const enc = rowEncoder(columns, o);
        const space = o.pretty ? 2 : 0;
        const nl = o.pretty ? '\n' : '';
        const arrays = o.shape === 'arrays';
        // items sit one (objects) or two (arrays shape) levels deep
        const pad = o.pretty ? (arrays ? '    ' : '  ') : '';
        let first = true;

        if (arrays) {
            const cols = JSON.stringify(
                uniqueNames(columns).map((name, i) => ({ name, type: columns[i].sqlType })),
                null,
                space
            );
            await sink.write(`{${nl}${pad.slice(2)}"columns": ${indent(cols, pad.slice(2))},${nl}${pad.slice(2)}"rows": [`);
        } else {
            await sink.write('[');
        }
        return {
            writeRows: (rows: Row[]) => {
                let out = '';
                for (const r of rows) {
                    const item = JSON.stringify(arrays ? enc.array(r) : enc.object(r), null, arrays ? 0 : space);
                    out += `${first ? '' : ','}${nl}${pad}${indent(item, pad)}`;
                    first = false;
                }
                return sink.write(out);
            },
            end: () => sink.write(`${first ? '' : nl}${arrays ? `${pad.slice(2)}]${nl}}` : ']'}\n`),
        };
    }
}

/** one JSON object per line (newline delimited JSON) */
export class JsonLinesSerializer implements Serializer<JsonLinesOptions> {
    readonly id = 'jsonl';
    readonly label = 'JSON Lines';
    readonly extension = '.jsonl';
    readonly streamCompressible = true;
    readonly defaults = JSONL_DEFAULTS;

    async open(columns: ExportColumn[], options: JsonLinesOptions, sink: ByteSink): Promise<SerializerWriter> {
        const enc = rowEncoder(columns, { ...JSONL_DEFAULTS, ...options });
        return {
            writeRows: (rows: Row[]) => sink.write(rows.map((r) => `${JSON.stringify(enc.object(r))}\n`).join('')),
            end: async () => {},
        };
    }
}
