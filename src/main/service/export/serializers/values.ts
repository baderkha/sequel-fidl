import { BinaryStyle, DateStyle, ExportColumn } from '../types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?$/;

/**
 * 'YYYY-MM-DD[ HH:MM:SS[.ffffff]]' read as a UTC wall clock → epoch microseconds ,
 * null for values that aren't real dates (0000-00-00 ...)
 */
export function epochMicros(text: string): bigint | null {
    const m = DATE_RE.exec(text);
    if (!m) return null;
    const [, y, mo, d, h = '0', mi = '0', s = '0', frac = ''] = m;
    if (+mo < 1 || +d < 1) return null;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (Number.isNaN(ms)) return null;
    return BigInt(ms) * 1000n + BigInt((frac + '000000').slice(0, 6));
}

export const epochDays = (text: string): number | null => {
    const us = epochMicros(text);
    return us === null ? null : Number(us / 86400000000n);
};

/** a date / datetime as stored ('sql') in the requested style */
export function dateValue(text: string, style: DateStyle): string | number | null {
    if (style === 'sql') return text;
    if (style === 'iso') return text.replace(' ', 'T');
    const us = epochMicros(text);
    return us === null ? null : Number(us / 1000n);
}

export const binaryText = (b: Buffer, style: BinaryStyle) => (style === 'hex' ? b.toString('hex') : b.toString('base64'));

/** column name → unique names (queries can return the same name twice) */
export function uniqueNames(columns: ExportColumn[]): string[] {
    const seen = new Map<string, number>();
    return columns.map((c) => {
        const n = (seen.get(c.name) || 0) + 1;
        seen.set(c.name, n);
        return n === 1 ? c.name : `${c.name}_${n}`;
    });
}
