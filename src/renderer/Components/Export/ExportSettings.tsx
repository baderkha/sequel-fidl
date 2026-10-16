import React from 'react';
import {
    api,
    CompressorDescriptor,
    ExportPreview,
    ExportRequest,
    FormatDescriptor,
    FormatId,
    FormatOptionsMap,
} from 'renderer/api';
import { FormatOptions } from './FormatOptions';

/**
 * Format , options , compression , chunks and row limit : shared by the single and the batch export ,
 * remembered across exports
 */

type Catalog = { formats: FormatDescriptor[]; compressors: CompressorDescriptor[] };
export type Compression = ExportRequest['compression'];
export type Chunk = NonNullable<ExportRequest['chunk']>;
const MB = 1024 * 1024;

const STORE = 'sequel-fidl.export';
const load = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(`${STORE}.${key}`);
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch (e) {
        return fallback;
    }
};
export const saveSetting = (key: string, value: unknown) => {
    try {
        localStorage.setItem(`${STORE}.${key}`, JSON.stringify(value));
    } catch (e) {}
};
export const loadSetting = load;

let catalogCache: Promise<Catalog> | null = null;
const getCatalog = () => {
    catalogCache = catalogCache || api.exportFormats();
    return catalogCache;
};

export const formatBytes = (n: number) =>
    n < 1024
        ? `${n} B`
        : n < MB
        ? `${(n / 1024).toFixed(1)} KB`
        : n < 1024 * MB
        ? `${(n / MB).toFixed(1)} MB`
        : `${(n / (1024 * MB)).toFixed(2)} GB`;
const formatSize = (n: number) => (n >= 1024 * MB ? `${+(n / (1024 * MB)).toFixed(2)} GB` : `${+(n / MB).toFixed(1)} MB`);
export const describeChunk = (c: Chunk) =>
    c.by === 'rows' ? `split every ${c.rows.toLocaleString()} rows` : c.by === 'bytes' ? `split every ${formatSize(c.bytes)}` : '';
export const formatDuration = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

export function useExportSettings() {
    const [catalog, setCatalog] = React.useState<Catalog | null>(null);
    const [format, setFormat] = React.useState<FormatId>(() => load<{ id: FormatId }>('format', { id: 'csv' }).id);
    const [options, setOptions] = React.useState<Partial<FormatOptionsMap>>({});
    const [compression, setCompression] = React.useState<Compression>(() => load<Compression>('compression', { id: 'none' }));
    /** per format , the format's default until changed */
    const [chunks, setChunks] = React.useState<Partial<Record<FormatId, Chunk>>>({});
    const [limitOn, setLimitOn] = React.useState(false);
    const [limit, setLimit] = React.useState(1000);

    React.useEffect(() => {
        getCatalog().then((c) => {
            setCatalog(c);
            setOptions(Object.fromEntries(c.formats.map((f) => [f.id, load(`options.${f.id}`, f.defaults as object)])));
            setChunks(
                Object.fromEntries(
                    c.formats.map((f) => {
                        try {
                            const raw = localStorage.getItem(`${STORE}.chunk.${f.id}`);
                            return [f.id, raw ? JSON.parse(raw) : f.defaultChunk];
                        } catch (e) {
                            return [f.id, f.defaultChunk];
                        }
                    })
                )
            );
            setFormat((cur) => (c.formats.some((f) => f.id === cur) ? cur : c.formats[0].id));
        });
    }, []);

    const descriptor = catalog?.formats.find((f) => f.id === format) || null;
    const compressor = descriptor?.streamCompressible ? catalog?.compressors.find((c) => c.id === compression.id) || null : null;
    const chunk: Chunk = chunks[format] || descriptor?.defaultChunk || { by: 'none' };
    const ready = !!(catalog && descriptor && options[format]);

    return {
        catalog,
        ready,
        format,
        descriptor,
        compressor,
        compression,
        chunk,
        limitOn,
        limit,
        setLimitOn,
        setLimit,
        /** what goes in a request */
        options: options[format] as FormatOptionsMap[FormatId],
        effectiveCompression: (compressor ? compression : { id: 'none' }) as Compression,
        effectiveLimit: limitOn ? Math.max(1, Math.floor(limit) || 1) : undefined,
        extension: `${descriptor?.extension || ''}${compressor?.extension || ''}`,
        chooseFormat(id: FormatId) {
            setFormat(id);
            saveSetting('format', { id });
        },
        setFormatOptions(o: FormatOptionsMap[FormatId]) {
            setOptions((all) => ({ ...all, [format]: o }));
            saveSetting(`options.${format}`, o);
        },
        chooseCompression(c: Compression) {
            setCompression(c);
            saveSetting('compression', c);
        },
        setChunk(c: Chunk) {
            setChunks((all) => ({ ...all, [format]: c }));
            saveSetting(`chunk.${format}`, c);
        },
    };
}

export type ExportSettingsState = ReturnType<typeof useExportSettings>;

/** format tabs , format options , compression , split , row limit */
export function ExportSettings({ s, limitLabel = 'Only the first' }: { s: ExportSettingsState; limitLabel?: string }) {
    const { catalog, descriptor, compressor, compression, chunk } = s;
    return (
        <>
            <div className="segmented export-formats">
                {catalog?.formats.map((f) => (
                    <button key={f.id} type="button" className={f.id === s.format ? 'is-active' : ''} onClick={() => s.chooseFormat(f.id)}>
                        {f.label}
                    </button>
                ))}
            </div>
            {s.ready && descriptor && (
                <FormatOptions
                    format={s.format}
                    options={s.options}
                    defaults={descriptor.defaults as FormatOptionsMap[FormatId]}
                    onChange={s.setFormatOptions}
                />
            )}
            {descriptor?.streamCompressible && catalog && (
                <div className="field">
                    <span className="field-label">Compression</span>
                    <div className="export-inline">
                        <div className="segmented is-compact export-compression">
                            {[{ id: 'none', label: 'None' } as const, ...catalog.compressors].map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={compression.id === c.id ? 'is-active' : ''}
                                    onClick={() => s.chooseCompression({ id: c.id })}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                        {compressor && (
                            <label className="export-level" title="Higher is smaller and slower">
                                Level
                                <input
                                    type="range"
                                    min={compressor.levels.min}
                                    max={compressor.levels.max}
                                    value={compression.level ?? compressor.levels.default}
                                    onChange={(ev) => s.chooseCompression({ ...compression, level: +ev.target.value })}
                                />
                                <span className="export-level-value">{compression.level ?? compressor.levels.default}</span>
                            </label>
                        )}
                    </div>
                </div>
            )}
            <div className="field">
                <span className="field-label">Split into files</span>
                <div className="export-inline">
                    <div className="segmented is-compact export-split">
                        {(
                            [
                                ['none', 'One file'],
                                ['rows', 'By rows'],
                                ['bytes', 'By size'],
                            ] as const
                        ).map(([by, label]) => (
                            <button
                                key={by}
                                type="button"
                                className={chunk.by === by ? 'is-active' : ''}
                                onClick={() =>
                                    s.setChunk(
                                        by === 'rows'
                                            ? { by, rows: chunk.by === 'rows' ? chunk.rows : 1000000 }
                                            : by === 'bytes'
                                            ? { by, bytes: chunk.by === 'bytes' ? chunk.bytes : 256 * MB }
                                            : { by }
                                    )
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {chunk.by === 'rows' && (
                        <>
                            <input
                                className="app-input export-limit"
                                type="number"
                                min={1}
                                value={chunk.rows}
                                onChange={(ev) => s.setChunk({ by: 'rows', rows: Math.max(1, Math.floor(+ev.target.value) || 1) })}
                            />
                            <span className="toolbar-text">rows each</span>
                        </>
                    )}
                    {chunk.by === 'bytes' && (
                        <>
                            <input
                                className="app-input export-limit"
                                type="number"
                                min={1}
                                value={+(chunk.bytes / MB).toFixed(2)}
                                onChange={(ev) => s.setChunk({ by: 'bytes', bytes: Math.max(0.01, +ev.target.value || 1) * MB })}
                            />
                            <span className="toolbar-text">MB each</span>
                        </>
                    )}
                </div>
            </div>
            <div className="export-inline">
                <label className="checkbox">
                    <input type="checkbox" checked={s.limitOn} onChange={(ev) => s.setLimitOn(ev.target.checked)} />
                    {limitLabel}
                </label>
                <input
                    className="app-input export-limit"
                    type="number"
                    min={1}
                    disabled={!s.limitOn}
                    value={s.limit}
                    onChange={(ev) => s.setLimit(+ev.target.value)}
                />
                <span className="toolbar-text">rows</span>
            </div>
        </>
    );
}

/** the first rows as they'd be written , or the parquet schema */
export function ExportPreviewPane(p: { preview: ExportPreview | null; previewing: boolean; s: ExportSettingsState; heading?: React.ReactNode }) {
    const { preview, s } = p;
    return (
        <div className="field export-preview-field">
            <span className="field-label export-columns-head">
                {preview?.schema ? 'Parquet schema' : 'Preview , first rows'}
                {p.previewing && ' …'}
                {s.compressor && ` (before ${s.compressor.label})`}
                {p.heading}
            </span>
            {preview?.error ? (
                <div className="error-box">{preview.error}</div>
            ) : preview?.schema ? (
                <div className="export-preview export-schema">
                    {preview.schema.map((f) => (
                        <div key={f.name}>
                            <span>{f.name}</span>
                            <span className="export-column-type">{f.type}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <pre className="export-preview">{preview?.text ?? ''}</pre>
            )}
        </div>
    );
}

/** runs a preview whenever the request (minus what doesn't change it) changes */
export function usePreview(req: ExportRequest | null) {
    const [preview, setPreview] = React.useState<ExportPreview | null>(null);
    const [previewing, setPreviewing] = React.useState(false);
    // compression / chunks / destination don't change the preview
    const key = req ? JSON.stringify({ ...req, defaultDir: null, compression: null, chunk: null }) : '';
    React.useEffect(() => {
        if (!key || !req) return undefined;
        let stale = false;
        const t = window.setTimeout(() => {
            setPreviewing(true);
            api.exportPreview(req).then((res) => {
                if (stale) return;
                setPreview(res);
                setPreviewing(false);
            });
        }, 250);
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [key]);
    return { preview, previewing };
}
