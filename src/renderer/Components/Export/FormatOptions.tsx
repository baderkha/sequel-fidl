import React from 'react';
import type { FormatId, FormatOptionsMap } from 'renderer/api';

type Csv = FormatOptionsMap['csv'];
type Json = FormatOptionsMap['json'];
type Jsonl = FormatOptionsMap['jsonl'];
type Parquet = FormatOptionsMap['parquet'];

// ---------------------------------------------------------------- small controls

function Choice<T extends string>(p: {
    label: string;
    value: T;
    options: Array<[T, string]>;
    onChange: (v: T) => void;
    title?: string;
}) {
    return (
        <label className="field" title={p.title}>
            <span className="field-label">{p.label}</span>
            <select className="select" value={p.value} onChange={(ev) => p.onChange(ev.target.value as T)}>
                {p.options.map(([v, l]) => (
                    <option key={v} value={v}>
                        {l}
                    </option>
                ))}
            </select>
        </label>
    );
}

function Check(p: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
    return (
        <label className="checkbox" title={p.title}>
            <input type="checkbox" checked={p.checked} onChange={(ev) => p.onChange(ev.target.checked)} />
            {p.label}
        </label>
    );
}

/** a fixed list plus "Other…" with a text box */
function ChoiceOrCustom(p: {
    label: string;
    value: string;
    options: Array<[string, string]>;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    const known = p.options.some(([v]) => v === p.value);
    const [custom, setCustom] = React.useState(!known);
    return (
        <label className="field">
            <span className="field-label">{p.label}</span>
            <div className="export-inline">
                <select
                    className="select"
                    value={custom ? '__custom' : p.value}
                    onChange={(ev) => {
                        if (ev.target.value === '__custom') {
                            setCustom(true);
                        } else {
                            setCustom(false);
                            p.onChange(ev.target.value);
                        }
                    }}
                >
                    {p.options.map(([v, l]) => (
                        <option key={v} value={v}>
                            {l}
                        </option>
                    ))}
                    <option value="__custom">Other…</option>
                </select>
                {custom && (
                    <input
                        className="app-input is-mono"
                        value={p.value}
                        placeholder={p.placeholder}
                        onChange={(ev) => p.onChange(ev.target.value)}
                    />
                )}
            </div>
        </label>
    );
}

const DATE_STYLES: Array<[Csv['dates'], string]> = [
    ['sql', 'As stored (2024-05-01 13:45:00)'],
    ['iso', 'ISO 8601 (2024-05-01T13:45:00)'],
    ['epoch-ms', 'Epoch milliseconds'],
];

// ---------------------------------------------------------------- csv

export const CSV_PRESETS: Array<{ id: string; label: string; patch: Partial<Csv> }> = [
    { id: 'rfc', label: 'Standard (RFC 4180)', patch: {} },
    { id: 'excel', label: 'Excel', patch: { bom: true, excelSafe: true, lineEnding: '\r\n' } },
    { id: 'tsv', label: 'TSV', patch: { delimiter: '\t' } },
    {
        id: 'loaddata',
        label: 'MySQL LOAD DATA',
        patch: { delimiter: '\t', quoteMode: 'none', escape: 'backslash', nullAs: '\\N', header: false },
    },
];

const same = (a: object, b: object) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());

function CsvForm({ o, defaults, set }: { o: Csv; defaults: Csv; set: (patch: Partial<Csv>) => void }) {
    const preset = CSV_PRESETS.find((p) => same({ ...defaults, ...p.patch }, o));
    return (
        <>
            <label className="field">
                <span className="field-label">Preset</span>
                <select
                    className="select"
                    value={preset ? preset.id : 'custom'}
                    onChange={(ev) => {
                        const p = CSV_PRESETS.find((x) => x.id === ev.target.value);
                        if (p) set({ ...defaults, ...p.patch });
                    }}
                >
                    {CSV_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.label}
                        </option>
                    ))}
                    {!preset && <option value="custom">Custom</option>}
                </select>
            </label>
            <div className="export-grid">
                <ChoiceOrCustom
                    label="Delimiter"
                    value={o.delimiter}
                    options={[
                        [',', 'Comma  ,'],
                        [';', 'Semicolon  ;'],
                        ['\t', 'Tab'],
                        ['|', 'Pipe  |'],
                    ]}
                    placeholder="e.g. ^"
                    onChange={(delimiter) => set({ delimiter })}
                />
                <Choice
                    label="Quote values"
                    value={o.quoteMode}
                    options={[
                        ['needed', 'When needed'],
                        ['strings', 'All text values'],
                        ['all', 'Always'],
                        ['none', 'Never'],
                    ]}
                    onChange={(quoteMode) => set({ quoteMode })}
                />
                <Choice
                    label="Quote character"
                    value={o.quote}
                    options={[
                        ['"', 'Double  "'],
                        ["'", "Single  '"],
                    ]}
                    onChange={(quote) => set({ quote })}
                />
                <Choice
                    label="Escaping"
                    value={o.escape}
                    options={[
                        ['double', 'Double the quote  ""'],
                        ['backslash', 'Backslash  \\"'],
                    ]}
                    title="How a quote inside a value is written (backslash also escapes line breaks when values aren't quoted)"
                    onChange={(escape) => set({ escape })}
                />
                <ChoiceOrCustom
                    label="NULL as"
                    value={o.nullAs}
                    options={[
                        ['', 'Empty'],
                        ['NULL', 'NULL'],
                        ['\\N', '\\N'],
                    ]}
                    onChange={(nullAs) => set({ nullAs })}
                />
                <Choice
                    label="Booleans"
                    value={o.booleans}
                    options={[
                        ['true/false', 'true / false'],
                        ['TRUE/FALSE', 'TRUE / FALSE'],
                        ['1/0', '1 / 0'],
                    ]}
                    onChange={(booleans) => set({ booleans })}
                />
                <Choice label="Dates" value={o.dates} options={DATE_STYLES} onChange={(dates) => set({ dates })} />
                <Choice
                    label="Binary"
                    value={o.binary}
                    options={[
                        ['hex', 'Hex'],
                        ['base64', 'Base64'],
                    ]}
                    onChange={(binary) => set({ binary })}
                />
                <Choice
                    label="Line endings"
                    value={o.lineEnding}
                    options={[
                        ['\n', 'LF (macOS , Linux)'],
                        ['\r\n', 'CRLF (Windows)'],
                    ]}
                    onChange={(lineEnding) => set({ lineEnding })}
                />
            </div>
            <div className="export-checks">
                <Check label="Header row" checked={o.header} onChange={(header) => set({ header })} />
                <Check
                    label="UTF-8 BOM"
                    title="Lets Excel detect UTF-8"
                    checked={o.bom}
                    onChange={(bom) => set({ bom })}
                />
                <Check
                    label="Formula safe"
                    title="Prefix text starting with = + - @ with ' so spreadsheets don't run it"
                    checked={o.excelSafe}
                    onChange={(excelSafe) => set({ excelSafe })}
                />
            </div>
        </>
    );
}

// ---------------------------------------------------------------- json / json lines

function JsonValueFields({ o, set }: { o: Jsonl; set: (patch: Partial<Jsonl>) => void }) {
    return (
        <>
            <Choice
                label="BIGINT"
                value={o.int64}
                options={[
                    ['auto', 'Number if exact , else text'],
                    ['number', 'Number (may round)'],
                    ['string', 'String'],
                ]}
                onChange={(int64) => set({ int64 })}
            />
            <Choice
                label="DECIMAL"
                value={o.decimals}
                options={[
                    ['string', 'String (exact)'],
                    ['number', 'Number (may round)'],
                ]}
                onChange={(decimals) => set({ decimals })}
            />
            <Choice label="Dates" value={o.dates} options={DATE_STYLES} onChange={(dates) => set({ dates })} />
            <Choice
                label="Binary"
                value={o.binary}
                options={[
                    ['base64', 'Base64'],
                    ['hex', 'Hex'],
                ]}
                onChange={(binary) => set({ binary })}
            />
            <Choice
                label="NULL fields"
                value={o.nulls}
                options={[
                    ['keep', 'Keep (null)'],
                    ['omit', 'Leave out'],
                ]}
                onChange={(nulls) => set({ nulls })}
            />
        </>
    );
}

function JsonForm({ o, set }: { o: Json; set: (patch: Partial<Json>) => void }) {
    return (
        <>
            <div className="export-grid">
                <Choice
                    label="Shape"
                    value={o.shape}
                    options={[
                        ['objects', 'Array of objects'],
                        ['arrays', 'Columns + rows (arrays)'],
                    ]}
                    onChange={(shape) => set({ shape })}
                />
                <JsonValueFields o={o} set={set} />
            </div>
            <div className="export-checks">
                <Check label="Pretty print" checked={o.pretty} onChange={(pretty) => set({ pretty })} />
            </div>
        </>
    );
}

// ---------------------------------------------------------------- parquet

function ParquetForm({ o, set }: { o: Parquet; set: (patch: Partial<Parquet>) => void }) {
    return (
        <div className="export-grid">
            <Choice
                label="Compression codec"
                value={o.codec}
                options={[
                    ['SNAPPY', 'Snappy (fast)'],
                    ['GZIP', 'Gzip (smaller)'],
                    ['BROTLI', 'Brotli (smallest)'],
                    ['UNCOMPRESSED', 'None'],
                ]}
                onChange={(codec) => set({ codec })}
            />
            <label className="field" title="Rows per row group , bigger groups compress better and use more memory">
                <span className="field-label">Row group size</span>
                <input
                    className="app-input"
                    type="number"
                    min={100}
                    step={10000}
                    value={o.rowGroupSize}
                    onChange={(ev) => set({ rowGroupSize: Math.max(100, +ev.target.value || 0) })}
                />
            </label>
            <Choice
                label="DECIMAL"
                value={o.decimals}
                options={[
                    ['decimal', 'DECIMAL (exact)'],
                    ['string', 'String'],
                    ['double', 'Double (may round)'],
                ]}
                onChange={(decimals) => set({ decimals })}
            />
            <Choice
                label="DATETIME"
                value={o.datetimes}
                options={[
                    ['timestamp', 'TIMESTAMP'],
                    ['string', 'String (as stored)'],
                ]}
                onChange={(datetimes) => set({ datetimes })}
            />
        </div>
    );
}

export function FormatOptions<F extends FormatId>(p: {
    format: F;
    options: FormatOptionsMap[F];
    defaults: FormatOptionsMap[F];
    onChange: (o: FormatOptionsMap[F]) => void;
}) {
    const set = (patch: object) => p.onChange({ ...p.options, ...patch });
    switch (p.format) {
        case 'csv':
            return <CsvForm o={p.options as Csv} defaults={p.defaults as Csv} set={set} />;
        case 'json':
            return <JsonForm o={p.options as Json} set={set} />;
        case 'jsonl':
            return (
                <div className="export-grid">
                    <JsonValueFields o={p.options as Jsonl} set={set} />
                </div>
            );
        case 'parquet':
            return <ParquetForm o={p.options as Parquet} set={set} />;
        default:
            return null;
    }
}
