import type { Filter, FilterMode, SortDirection } from '../../util/sql_admin_commands';

/**
 * Export pipeline :
 *
 *   source (rows + column types) → transforms → chunker → serializer → compressor → sink (one per chunk)
 *
 * The chunker splits the rows into parts by row count or file size , every part is a complete file
 * (its own JSON document , CSV header , Parquet footer)
 *
 * Every stage only knows the contracts in this file , so formats / codecs / sources plug in independently
 */

// ---------------------------------------------------------------- columns & rows

/** what a column holds , independent of the database and the output format */
export type ColumnKind =
    | 'int32'
    | 'int64'
    | 'uint64'
    | 'float'
    | 'double'
    | 'decimal'
    | 'bool'
    | 'date'
    | 'datetime'
    | 'time'
    | 'string'
    | 'json'
    | 'binary';

export type ExportColumn = {
    name: string;
    kind: ColumnKind;
    /** database type , e.g. DECIMAL(10,2) , for display */
    sqlType: string;
    /** decimal digits */
    precision?: number;
    scale?: number;
    /** fractional second digits of datetime / time */
    fsp?: number;
};

/**
 * One row , values in column order , canonical per kind after the normalize transform :
 * int32 / float / double → number · int64 / uint64 → bigint · decimal → string (exact)
 * bool → boolean · date → 'YYYY-MM-DD' · datetime → 'YYYY-MM-DD HH:MM:SS[.ffffff]' (as stored)
 * time / string → string · json → parsed value · binary → Buffer · null → null
 */
export type Row = unknown[];

// ---------------------------------------------------------------- stages

/** rows in batches , columns known before the first row */
export type OpenedSource = {
    columns: ExportColumn[];
    batches: AsyncIterable<Row[]>;
    /** stops the query if it is still running , releases the connection */
    close(): Promise<void>;
};

export interface RowSource {
    open(): Promise<OpenedSource>;
    /** total rows when cheap to know (progress) */
    count?(): Promise<number | null>;
}

/** data → transformed : may change columns and rows */
export interface RowTransform {
    columns(columns: ExportColumn[]): ExportColumn[];
    rows(rows: Row[]): Row[];
    /** true once no more rows are wanted (limits) */
    done?(): boolean;
}

/** where serialized bytes go , resolves once the next stage can take more (backpressure) */
export interface ByteSink {
    write(chunk: Buffer | string): Promise<void>;
}

export interface SerializerWriter {
    writeRows(rows: Row[]): Promise<void>;
    end(): Promise<void>;
}

export interface Serializer<O = unknown> {
    readonly id: FormatId;
    readonly label: string;
    /** '.csv' */
    readonly extension: string;
    /** false when the format compresses internally (parquet codecs) */
    readonly streamCompressible: boolean;
    readonly defaults: O;
    open(columns: ExportColumn[], options: O, sink: ByteSink): Promise<SerializerWriter>;
    /** the output schema , for formats that have one */
    describe?(columns: ExportColumn[], options: O): SchemaField[];
    /** how this format is split into files unless asked otherwise */
    readonly defaultChunk?: ChunkPolicy;
}

/** split the output into several files : every n rows , or once a file reaches n bytes */
export type ChunkPolicy = { by: 'none' } | { by: 'rows'; rows: number } | { by: 'bytes'; bytes: number };

export type SchemaField = { name: string; type: string };

export interface Compressor {
    readonly id: CompressorId;
    readonly label: string;
    /** '.gz' */
    readonly extension: string;
    readonly levels: { min: number; max: number; default: number };
    create(level?: number): NodeJS.ReadWriteStream;
}

/** final destination of the bytes of one chunk */
export interface ExportSink {
    readonly stream: NodeJS.WritableStream;
    /** the export finished , make the output visible (index of this chunk , how many there are) */
    commit(index: number, count: number): Promise<void>;
    /** failed / cancelled , remove what was written */
    abort(): Promise<void>;
}

// ---------------------------------------------------------------- format options

/** how dates / datetimes are written : as stored , ISO 8601 (no zone) , epoch milliseconds (wall clock as UTC) */
export type DateStyle = 'sql' | 'iso' | 'epoch-ms';
export type BinaryStyle = 'hex' | 'base64';

export type CsvOptions = {
    /** any string , ',' ';' '\t' '|' ... */
    delimiter: string;
    quote: '"' | "'";
    /** needed : only values with a delimiter / quote / newline , strings : every text value , all , none */
    quoteMode: 'needed' | 'strings' | 'all' | 'none';
    /** a quote inside a value : doubled ("") or backslash (\") */
    escape: 'double' | 'backslash';
    header: boolean;
    lineEnding: '\n' | '\r\n';
    /** how NULL is written , '' / NULL / \N */
    nullAs: string;
    booleans: 'true/false' | 'TRUE/FALSE' | '1/0';
    dates: DateStyle;
    binary: BinaryStyle;
    /** UTF-8 byte order mark , makes Excel read UTF-8 */
    bom: boolean;
    /** prefix cells starting with = + - @ with ' so spreadsheets don't run them as formulas */
    excelSafe: boolean;
};

export type JsonValueOptions = {
    /** auto : numbers when they fit a double exactly , strings otherwise */
    int64: 'auto' | 'number' | 'string';
    decimals: 'string' | 'number';
    dates: DateStyle;
    binary: BinaryStyle;
    /** keep null fields or leave them out */
    nulls: 'keep' | 'omit';
};

export type JsonOptions = JsonValueOptions & {
    pretty: boolean;
    /** objects : [{col: value}] , arrays : {"columns": [...], "rows": [[...]]} */
    shape: 'objects' | 'arrays';
};

export type JsonLinesOptions = JsonValueOptions;

export type ParquetCodec = 'UNCOMPRESSED' | 'SNAPPY' | 'GZIP' | 'BROTLI';

export type ParquetOptions = {
    codec: ParquetCodec;
    rowGroupSize: number;
    /** decimal : exact DECIMAL logical type , string , double (lossy) */
    decimals: 'decimal' | 'string' | 'double';
    /** timestamp : TIMESTAMP (wall clock stored as UTC) , string : as stored */
    datetimes: 'timestamp' | 'string';
};

export type FormatOptionsMap = {
    csv: CsvOptions;
    json: JsonOptions;
    jsonl: JsonLinesOptions;
    parquet: ParquetOptions;
};
export type FormatId = keyof FormatOptionsMap;
export type CompressorId = 'none' | 'gzip' | 'brotli';

// ---------------------------------------------------------------- requests (renderer → main)

export type ExportSourceSpec =
    | {
          kind: 'table';
          table: string;
          filters?: Filter[];
          filterMode?: FilterMode;
          orderBy?: string;
          orderDir?: SortDirection;
      }
    | {
          /** one read only statement (SELECT / WITH / SHOW ...) , run again to stream every row */
          kind: 'query';
          sql: string;
      };

export type ExportRequest<F extends FormatId = FormatId> = {
    conID: string;
    source: ExportSourceSpec;
    /** columns to keep , in this order , all when empty */
    columns?: string[];
    /** at most this many rows */
    limit?: number;
    format: F;
    options: FormatOptionsMap[F];
    compression: { id: CompressorId; level?: number };
    /** split into several files , the format's default when missing */
    chunk?: ChunkPolicy;
    /** folder the save dialog starts in */
    defaultDir?: string | null;
    /** file name without extension */
    baseName?: string;
};

/** for the export dialog , built from the registries */
export type FormatDescriptor = {
    id: FormatId;
    label: string;
    extension: string;
    streamCompressible: boolean;
    defaults: unknown;
    defaultChunk: ChunkPolicy;
};
export type CompressorDescriptor = {
    id: CompressorId;
    label: string;
    extension: string;
    levels: { min: number; max: number; default: number };
};

export type ExportProgress = {
    jobId: string;
    state: 'running' | 'done' | 'error' | 'cancelled';
    rows: number;
    /** bytes written to the file (after compression) */
    bytes: number;
    total: number | null;
    ms: number;
    /** the chosen file , chunks are named after it (city.part-001.json) */
    path: string;
    /** chunks started so far */
    parts: number;
    /** the files , once done */
    files: string[];
    error?: string;
};

export type ExportPreview = {
    columns: ExportColumn[];
    /** text formats : the first rows as they'd be written (uncompressed) */
    text?: string;
    /** formats with a schema (parquet) */
    schema?: SchemaField[];
    error?: string;
};

// ---------------------------------------------------------------- batch (many tables , one job)

export type ExistingFiles = 'replace' | 'keep-both' | 'skip';

export type BatchExportRequest<F extends FormatId = FormatId> = {
    conID: string;
    /** in this order , columns : all when empty */
    items: Array<{ table: string; columns?: string[] }>;
    format: F;
    options: FormatOptionsMap[F];
    compression: { id: CompressorId; level?: number };
    chunk?: ChunkPolicy;
    /** at most this many rows per table */
    limit?: number;
    /** folder the files go in */
    dir: string;
    /** created inside dir , e.g. world-2026-10-16 */
    subfolder?: string;
    existing: ExistingFiles;
    /** read every table at the same point in time (ignored inside a transaction , which already is one) */
    snapshot: boolean;
};

export type BatchItemProgress = {
    table: string;
    state: 'queued' | 'running' | 'done' | 'skipped' | 'error' | 'cancelled';
    rows: number;
    bytes: number;
    total: number | null;
    files: string[];
    error?: string;
};

export type BatchProgress = {
    batchId: string;
    state: 'running' | 'done' | 'cancelled';
    /** where the files go */
    dir: string;
    items: BatchItemProgress[];
    ms: number;
};
