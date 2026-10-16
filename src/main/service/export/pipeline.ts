import { PassThrough, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { applyColumns, applyRows } from './transforms';
import {
    ByteSink,
    ChunkPolicy,
    Compressor,
    ExportColumn,
    ExportSink,
    OpenedSource,
    Row,
    RowSource,
    RowTransform,
    Serializer,
    SerializerWriter,
} from './types';

export class ExportCancelled extends Error {
    constructor() {
        super('Export cancelled');
        this.name = 'ExportCancelled';
        // the main process compiles to ES5 , where subclassing Error loses the prototype (instanceof fails)
        Object.setPrototypeOf(this, ExportCancelled.prototype);
    }
}

export type PipelineProgress = { rows: number; bytes: number; files: number };

export type PipelineSpec = {
    source: RowSource;
    transforms: RowTransform[];
    serializer: Serializer<any>;
    options: unknown;
    compressor: Compressor | null;
    level?: number;
    /** where chunk `index` goes */
    sink: (index: number) => ExportSink;
    chunk?: ChunkPolicy;
    signal?: AbortSignal;
    onProgress?: (p: PipelineProgress) => void;
    /** ms between progress reports */
    progressEvery?: number;
};

export type PipelineResult = PipelineProgress & { columns: ExportColumn[] };

/** rows written between size checks , bounds how far a size limited chunk can overshoot */
const SIZE_SLICE = 256;

/** one output file : serializer → [compressor] → byte counter → sink */
type Part = {
    sink: ExportSink;
    writer: SerializerWriter;
    head: PassThrough;
    flowing: Promise<void>;
    rows: number;
    bytes: number;
};

/** writes into a stream , waiting when it's full , failing when the pipeline broke */
const streamWriter = (head: PassThrough, failure: () => Error | null): ByteSink => ({
    write: (chunk) =>
        new Promise<void>((resolve, reject) => {
            if (failure() || head.destroyed) return reject(failure() || new Error('The output closed'));
            if (head.write(chunk)) return resolve();
            const off = () => {
                head.off('drain', ok);
                head.off('close', closed);
            };
            const ok = () => {
                off();
                resolve();
            };
            const closed = () => {
                off();
                reject(failure() || new Error('The output closed'));
            };
            head.once('drain', ok);
            head.once('close', closed);
        }),
});

/**
 * source → transforms → chunker → serializer → [compressor] → sink
 *
 * Rows are pulled in batches , serialized bytes go through node streams (backpressure all the way to the
 * file) , the chunker starts a new complete file whenever the current one is full , the sinks only keep
 * their output once everything succeeded
 */
export async function runPipeline(spec: PipelineSpec): Promise<PipelineResult> {
    const { signal } = spec;
    if (signal?.aborted) throw new ExportCancelled();
    let opened: OpenedSource;
    try {
        opened = await spec.source.open();
    } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
    }
    // cancelling while waiting on the database ends the query , which ends the loop below
    const onAbort = () => opened.close().catch(() => {});
    signal?.addEventListener('abort', onAbort);

    const chunk: ChunkPolicy = spec.chunk || { by: 'none' };
    const maxRows = chunk.by === 'rows' ? Math.max(1, Math.floor(chunk.rows)) : Infinity;
    const maxBytes = chunk.by === 'bytes' ? Math.max(1, Math.floor(chunk.bytes)) : Infinity;
    const parts: Part[] = [];
    let current: Part | null = null;
    let columns: ExportColumn[] = [];
    let rows = 0;
    let bytes = 0;

    const openPart = async (): Promise<Part> => {
        const sink = spec.sink(parts.length);
        const head = new PassThrough();
        let flowError: Error | null = null;
        const part = { sink, head, rows: 0, bytes: 0 } as Part;
        const counter = new Transform({
            transform(c: Buffer, _enc, cb) {
                part.bytes += c.length;
                bytes += c.length;
                cb(null, c);
            },
        });
        const stages: NodeJS.ReadWriteStream[] = spec.compressor ? [spec.compressor.create(spec.level)] : [];
        part.flowing = (pipeline as (...s: unknown[]) => Promise<void>)(head, ...stages, counter, sink.stream);
        part.flowing.catch((err: Error) => {
            flowError = err;
        });
        parts.push(part);
        part.writer = await spec.serializer.open(columns, spec.options, streamWriter(head, () => flowError));
        return part;
    };
    const closePart = async (part: Part) => {
        await part.writer.end();
        part.head.end();
        await part.flowing;
    };

    let lastReport = 0;
    const report = (force = false) => {
        const now = Date.now();
        if (!spec.onProgress || (!force && now - lastReport < (spec.progressEvery ?? 250))) return;
        lastReport = now;
        spec.onProgress({ rows, bytes, files: parts.length });
    };
    const check = () => {
        if (signal?.aborted) throw new ExportCancelled();
    };

    /** the chunker : fills the current file , starts the next one when it's full */
    const write = async (out: Row[]) => {
        let at = 0;
        while (at < out.length) {
            if (!current) current = await openPart();
            let take = Math.min(out.length - at, maxRows - current.rows);
            if (maxBytes !== Infinity) take = Math.min(take, SIZE_SLICE);
            await current.writer.writeRows(at === 0 && take === out.length ? out : out.slice(at, at + take));
            current.rows += take;
            rows += take;
            at += take;
            if (current.rows >= maxRows || current.bytes >= maxBytes) {
                await closePart(current);
                current = null;
            }
        }
    };

    try {
        columns = applyColumns(spec.transforms, opened.columns);
        for await (const batch of opened.batches) {
            check();
            const out = applyRows(spec.transforms, batch);
            if (out.length) {
                await write(out);
                report();
            }
            if (spec.transforms.some((t) => t.done?.())) break;
        }
        check();
        // no rows at all : still one (empty) file , a header / [] / schema
        if (!parts.length) current = await openPart();
        if (current) await closePart(current);
        current = null;
        check();
        for (let i = 0; i < parts.length; i += 1) await parts[i].sink.commit(i, parts.length);
        report(true);
        return { rows, bytes, files: parts.length, columns };
    } catch (err) {
        for (const part of parts) {
            part.head.destroy();
            await part.flowing?.catch(() => {});
            await part.sink.abort().catch(() => {});
        }
        if (signal?.aborted) throw new ExportCancelled();
        // some libraries throw strings
        throw err instanceof Error ? err : new Error(String(err));
    } finally {
        signal?.removeEventListener('abort', onAbort);
        await opened.close().catch(() => {});
    }
}
