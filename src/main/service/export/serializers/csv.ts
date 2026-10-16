import { ByteSink, ColumnKind, CsvOptions, ExportColumn, Row, Serializer, SerializerWriter } from '../types';
import { binaryText, dateValue, uniqueNames } from './values';

export const CSV_DEFAULTS: CsvOptions = {
    delimiter: ',',
    quote: '"',
    quoteMode: 'needed',
    escape: 'double',
    header: true,
    lineEnding: '\n',
    nullAs: '',
    booleans: 'true/false',
    dates: 'sql',
    binary: 'hex',
    bom: false,
    excelSafe: false,
};

const NUMERIC: ColumnKind[] = ['int32', 'int64', 'uint64', 'float', 'double', 'decimal', 'bool'];
/** what spreadsheets treat as the start of a formula */
const FORMULA_START = /^[=+\-@\t\r]/;

export function validateCsv(o: CsvOptions): string | null {
    if (!o.delimiter) return 'The delimiter is empty.';
    if (/[\r\n]/.test(o.delimiter)) return "The delimiter can't contain a line break.";
    if (o.delimiter.includes(o.quote)) return "The delimiter can't contain the quote character.";
    if (/[\r\n]/.test(o.nullAs)) return "NULL can't be written as a line break.";
    return null;
}

/**
 * RFC 4180 by default , every part of it configurable (TSV , LOAD DATA style , Excel ...)
 */
export class CsvSerializer implements Serializer<CsvOptions> {
    readonly id = 'csv';
    readonly label = 'CSV';
    readonly extension = '.csv';
    readonly streamCompressible = true;
    readonly defaults = CSV_DEFAULTS;

    async open(columns: ExportColumn[], options: CsvOptions, sink: ByteSink): Promise<SerializerWriter> {
        const o = { ...CSV_DEFAULTS, ...options };
        const invalid = validateCsv(o);
        if (invalid) throw new Error(invalid);
        const { delimiter, quote, lineEnding } = o;
        const [t, f] = o.booleans.split('/');

        const needsQuotes = (s: string) => s.includes(delimiter) || s.includes(quote) || s.includes('\n') || s.includes('\r');
        const quoted = (s: string) =>
            o.escape === 'double'
                ? quote + s.split(quote).join(quote + quote) + quote
                : quote + s.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`) + quote;
        /** no quoting , LOAD DATA style escapes keep the row on one line */
        const escapedRaw = (s: string) => {
            if (o.escape === 'double') return s;
            let out = s.replace(/\\/g, '\\\\').replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            out = delimiter === '\t' ? out.replace(/\t/g, '\\t') : out.split(delimiter).join(`\\${delimiter}`);
            return out;
        };

        const text = (v: unknown, kind: ColumnKind): string => {
            switch (kind) {
                case 'bool':
                    return v ? t : f;
                case 'date':
                case 'datetime': {
                    const d = dateValue(v as string, o.dates);
                    return d === null ? o.nullAs : `${d}`;
                }
                case 'json':
                    return JSON.stringify(v);
                case 'binary':
                    return binaryText(v as Buffer, o.binary);
                default:
                    return `${v}`;
            }
        };
        const cell = (v: unknown, kind: ColumnKind): string => {
            // NULL is never quoted , so '' (NULL) and "" (empty string) stay different in quote-all mode
            if (v === null) return o.nullAs;
            let s = text(v, kind);
            const numeric = NUMERIC.includes(kind);
            if (o.excelSafe && !numeric && FORMULA_START.test(s)) s = `'${s}`;
            switch (o.quoteMode) {
                case 'all':
                    return quoted(s);
                case 'strings':
                    return numeric && !needsQuotes(s) ? s : quoted(s);
                case 'none':
                    return escapedRaw(s);
                default:
                    return needsQuotes(s) ? quoted(s) : s;
            }
        };
        const kinds = columns.map((c) => c.kind);
        const line = (cells: string[]) => cells.join(delimiter) + lineEnding;

        let head = o.bom ? '﻿' : '';
        if (o.header) head += line(uniqueNames(columns).map((n) => cell(n, 'string')));
        if (head) await sink.write(head);

        return {
            writeRows: (rows: Row[]) => sink.write(rows.map((r) => line(r.map((v, i) => cell(v, kinds[i])))).join('')),
            end: async () => {},
        };
    }
}
