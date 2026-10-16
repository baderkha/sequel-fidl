import zlib from 'zlib';
import { ByteSink, ExportColumn, ParquetCodec, ParquetOptions, Row, SchemaField, Serializer, SerializerWriter } from '../types';
import { epochDays, epochMicros, uniqueNames } from './values';

// main process dependency (release/app) , loaded on first use
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadParquet = () => require('@dsnp/parquetjs');

export const PARQUET_DEFAULTS: ParquetOptions = {
    codec: 'SNAPPY',
    rowGroupSize: 50000,
    decimals: 'decimal',
    datetimes: 'timestamp',
};

/** pass through values we already converted , negative ones included */
const signedPrimitive = (type: string) => (v: unknown) => {
    if (typeof v === 'bigint') return v;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid ${type} value: ${v}`);
    return n;
};

let libraryPatched = false;
/**
 * Two fixes to the writer , applied once :
 * dates / timestamps before 1970 are valid parquet (signed) but the library rejects negative values ,
 * and its gzip / brotli are pure js / wasm while node's zlib writes the same formats faster
 */
function patchLibrary() {
    if (libraryPatched) return;
    libraryPatched = true;
    // the writer looks converters and codecs up in these tables for every value / page (same module instances)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const types = require('@dsnp/parquetjs/dist/lib/types');
    ['DATE', 'TIMESTAMP_MILLIS', 'TIMESTAMP_MICROS'].forEach((t) => {
        const def = types.getParquetTypeDataObject(t);
        if (def) def.toPrimitive = signedPrimitive(t);
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const methods = require('@dsnp/parquetjs/dist/lib/compression').PARQUET_COMPRESSION_METHODS;
    if (!methods) return;
    methods.GZIP = { deflate: (v: Buffer) => zlib.gzipSync(v), inflate: (v: Buffer) => zlib.gunzipSync(v) };
    methods.BROTLI = {
        deflate: (v: Buffer) => zlib.brotliCompressSync(v, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }),
        inflate: (v: Buffer) => zlib.brotliDecompressSync(v),
    };
}

/** bytes a two's complement big endian decimal of this precision needs */
const decimalBytes = (precision: number) => {
    // no ** : the main process compiles to ES5 , where it becomes Math.pow (which rejects BigInt)
    const max = BigInt(`1${'0'.repeat(precision)}`);
    let n = 1;
    while (1n << BigInt(8 * n - 1) <= max) n += 1;
    return n;
};

/** two's complement big endian , fixed width (or the minimum width when n is undefined) */
function twosComplement(v: bigint, n?: number): Buffer {
    let width = n;
    if (width === undefined) {
        width = 1;
        const abs = v < 0n ? -v - 1n : v;
        while (abs >= 1n << BigInt(8 * width - 1)) width += 1;
    }
    let x = v < 0n ? (1n << BigInt(width * 8)) + v : v;
    const b = Buffer.alloc(width);
    for (let i = width - 1; i >= 0; i -= 1) {
        b[i] = Number(x & 0xffn);
        x >>= 8n;
    }
    return b;
}

/** '-123.4' at scale 2 → -12340n (exact , no float math) */
function unscaled(text: string, scale: number): bigint {
    const neg = text.startsWith('-');
    const [int, frac = ''] = text.replace(/^[-+]/, '').split('.');
    const digits = (int || '0') + frac.padEnd(scale, '0').slice(0, scale);
    const v = BigInt(digits);
    return neg ? -v : v;
}

type FieldPlan = {
    name: string;
    def: Record<string, unknown>;
    /** canonical value → what the writer takes */
    convert: (v: unknown) => unknown;
    describe: string;
};

const asIs = (v: unknown) => v;

function plan(c: ExportColumn, name: string, o: ParquetOptions): FieldPlan {
    const field = (type: string, convert: (v: unknown) => unknown = asIs, extra: Record<string, unknown> = {}, describe = type): FieldPlan => ({
        name,
        def: { type, optional: true, compression: o.codec, ...extra },
        convert,
        describe,
    });
    switch (c.kind) {
        case 'int32':
            return field('INT32');
        case 'int64':
            return field('INT64');
        case 'uint64':
            // the library's UINT_64 encoder overflows above 2^63 , DECIMAL(20,0) holds every value exactly
            return field('DECIMAL', (v) => twosComplement(v as bigint), { precision: 20, scale: 0 }, 'DECIMAL(20,0)');
        case 'float':
            return field('FLOAT');
        case 'double':
            return field('DOUBLE');
        case 'decimal': {
            if (o.decimals === 'string') return field('UTF8', asIs, {}, 'STRING');
            if (o.decimals === 'double') return field('DOUBLE', (v) => Number(v));
            const precision = c.precision || 65;
            const scale = c.scale || 0;
            const typeLength = decimalBytes(precision);
            return field(
                'DECIMAL',
                (v) => twosComplement(unscaled(v as string, scale), typeLength),
                { precision, scale, typeLength },
                `DECIMAL(${precision},${scale})`
            );
        }
        case 'bool':
            return field('BOOLEAN');
        case 'date':
            return field('DATE', (v) => epochDays(v as string));
        case 'datetime':
            if (o.datetimes === 'string') return field('UTF8', asIs, {}, 'STRING');
            return (c.fsp || 0) > 3
                ? field('TIMESTAMP_MICROS', (v) => epochMicros(v as string), {}, 'TIMESTAMP(µs)')
                : field(
                      'TIMESTAMP_MILLIS',
                      (v) => {
                          const us = epochMicros(v as string);
                          return us === null ? null : Number(us / 1000n);
                      },
                      {},
                      'TIMESTAMP(ms)'
                  );
        case 'json':
            return field('JSON');
        case 'binary':
            return field('BYTE_ARRAY', asIs, {}, 'BINARY');
        default:
            // time (can exceed 24h) , text , enum , set
            return field('UTF8', asIs, {}, 'STRING');
    }
}

const plans = (columns: ExportColumn[], o: ParquetOptions) => {
    const names = uniqueNames(columns);
    return columns.map((c, i) => plan(c, names[i], o));
};

/**
 * Apache Parquet , typed columns , compressed per column chunk with the chosen codec ,
 * streamed one row group at a time
 */
export class ParquetSerializer implements Serializer<ParquetOptions> {
    readonly id = 'parquet';
    readonly label = 'Parquet';
    readonly extension = '.parquet';
    readonly streamCompressible = false;
    readonly defaults = PARQUET_DEFAULTS;

    static readonly codecs: ParquetCodec[] = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'BROTLI'];

    describe(columns: ExportColumn[], options: ParquetOptions): SchemaField[] {
        return plans(columns, { ...PARQUET_DEFAULTS, ...options }).map((p) => ({ name: p.name, type: p.describe }));
    }

    async open(columns: ExportColumn[], options: ParquetOptions, sink: ByteSink): Promise<SerializerWriter> {
        const o = { ...PARQUET_DEFAULTS, ...options };
        if (!ParquetSerializer.codecs.includes(o.codec)) throw new Error(`Unsupported Parquet codec ${o.codec}`);
        const parquet = loadParquet();
        patchLibrary();
        const fields = plans(columns, o);
        const schema = new parquet.ParquetSchema(Object.fromEntries(fields.map((f) => [f.name, f.def])));
        // the writer wants a node style stream : write(buf , cb) / end(cb)
        const out = {
            write: (buf: Buffer, cb: (err?: Error) => void) => {
                sink.write(buf).then(() => cb(), cb);
                return true;
            },
            end: (cb: (err?: Error) => void) => cb && cb(),
        };
        const writer = await parquet.ParquetWriter.openStream(schema, out, {
            rowGroupSize: Math.max(100, Math.floor(o.rowGroupSize) || PARQUET_DEFAULTS.rowGroupSize),
        });
        return {
            async writeRows(rows: Row[]) {
                for (const r of rows) {
                    const rec: Record<string, unknown> = {};
                    for (let i = 0; i < fields.length; i += 1) {
                        const v = r[i] === null ? null : fields[i].convert(r[i]);
                        if (v !== null && v !== undefined) rec[fields[i].name] = v;
                    }
                    await writer.appendRow(rec);
                }
            },
            end: () => writer.close(),
        };
    }
}
