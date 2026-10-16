import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { finished, PassThrough } from 'stream';
import { v4 } from 'uuid';
import { ExportSink } from './types';

/**
 * city.json , chunk 2 of 12 → city.part-002.json (the part goes before the whole extension , .csv.gz too)
 * @param target the file the user chose
 * @param ext the full extension (.csv.gz)
 */
export function chunkPath(target: string, ext: string, index: number, count: number): string {
    if (count <= 1) return target;
    const base = ext && target.endsWith(ext) ? target.slice(0, -ext.length) : target;
    const width = Math.max(3, `${count}`.length);
    return `${base}.part-${`${index + 1}`.padStart(width, '0')}${ext}`;
}

/**
 * One file per chunk , written next to the target as hidden temp files and renamed into place once
 * every chunk succeeded , so a failed / cancelled export never leaves half written files
 * (or clobbers existing ones) , a single chunk keeps the chosen name
 * @param target the file the user chose
 * @param ext the full extension (.csv.gz)
 */
export function fileSinks(target: string, ext: string) {
    const committed: string[] = [];
    const open = (index: number): ExportSink => {
        const temp = path.join(path.dirname(target), `.${path.basename(target)}.${index}.${v4().slice(0, 8)}.partial`);
        const stream = createWriteStream(temp, { flags: 'wx' });
        return {
            stream,
            commit: async (i, count) => {
                const final = chunkPath(target, ext, i, count);
                await fs.rename(temp, final);
                committed[i] = final;
            },
            abort: async () => {
                // the file may still be opening : close it before removing , or it comes back
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, 2000);
                    finished(stream, () => {
                        clearTimeout(timer);
                        resolve();
                    });
                    stream.destroy();
                });
                await fs.rm(temp, { force: true });
            },
        };
    };
    return { open, committed };
}

/** keeps the bytes in memory (previews) */
export function memorySink(): ExportSink & { text(): string } {
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on('data', (c: Buffer) => chunks.push(c));
    return {
        stream,
        commit: async () => {},
        abort: async () => {},
        text: () => Buffer.concat(chunks).toString('utf8'),
    };
}
