import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ColSchema } from 'renderer/api';
import { binaryBytes, describeValue, DocumentValue, readOnlyField, RecordDocument } from './documentValues';

function JsonField(p: {
    name: string;
    value: DocumentValue;
    path: string;
    depth: number;
    last: boolean;
    column?: ColSchema;
    sourceValue?: any;
    arrayItem?: boolean;
}) {
    const [expanded, setExpanded] = React.useState(false);
    const object = p.value !== null && typeof p.value === 'object';
    const array = Array.isArray(p.value);
    const count = object ? (Array.isArray(p.value) ? p.value.length : Object.keys(p.value).length) : 0;
    const expandable = count > 0;
    const entries = expanded && object ? Object.entries(p.value) : [];
    const open = array ? '[' : '{';
    const close = array ? ']' : '}';
    const summary = object ? `${open}${expandable ? '…' : ''}${close}` : JSON.stringify(p.value);
    const details = [
        p.path,
        `Type: ${p.column && binaryBytes(p.sourceValue) ? `binary · ${binaryBytes(p.sourceValue).length} bytes` : p.column && p.sourceValue === null ? 'SQL NULL' : describeValue(p.value)}`,
        p.column && `SQL type: ${p.column.Type}`,
        p.column && (p.column.NullAllowed ? 'Nullable' : 'NOT NULL'),
        p.column?.IsPrimaryKey && 'Primary key',
        p.column?.IsUnique && 'Unique',
        p.column?.AutoIncrement && 'Auto increment',
        p.column?.Extra,
        p.column && readOnlyField(p.sourceValue, p.column) && 'Read only',
        p.column?.Default !== undefined && p.column?.Default !== null && `Default: ${String(p.column.Default)}`,
        !object && `Value: ${summary.slice(0, 2000)}${summary.length > 2000 ? '…' : ''}`,
    ].filter(Boolean).join('\n');

    return (
        <>
            <div className="json-field" style={{ paddingLeft: 10 + p.depth * 18 }} title={details}>
                {expandable ? (
                    <button
                        type="button"
                        className="json-disclosure"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${p.path}`}
                        aria-expanded={expanded}
                        onClick={() => setExpanded((v) => !v)}
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                ) : <span className="json-disclosure" />}
                {!p.arrayItem && <><span className="json-key">{JSON.stringify(p.name)}</span><span className="json-punctuation">: </span></>}
                <span className={`json-value is-${object ? 'object' : p.value === null ? 'null' : typeof p.value}`}>
                    {expanded ? open : summary}
                </span>
                {object && !expanded && <span className="json-count">{describeValue(p.value)}</span>}
                {!expanded && !p.last && <span className="json-punctuation">,</span>}
            </div>
            {expanded && (
                <>
                    {entries.map(([key, value], index) => (
                        <JsonField
                            key={key}
                            name={key}
                            value={value}
                            path={`${p.path}[${array ? key : JSON.stringify(key)}]`}
                            depth={p.depth + 1}
                            last={index === entries.length - 1}
                            arrayItem={array}
                        />
                    ))}
                    <div className="json-field json-punctuation" style={{ paddingLeft: 26 + p.depth * 18 }}>
                        {close}{p.last ? '' : ','}
                    </div>
                </>
            )}
        </>
    );
}

/** Nested containers mount their children only when expanded. */
export function JsonTree(p: { document: RecordDocument; schema: ColSchema[]; row?: Record<string, any> }) {
    const entries = Object.entries(p.document);
    return (
        <div className="json-tree">
            <div className="json-field json-punctuation">{'{'}</div>
            {entries.map(([key, value], index) => (
                <JsonField
                    key={key}
                    name={key}
                    value={value}
                    path={`$[${JSON.stringify(key)}]`}
                    depth={0}
                    last={index === entries.length - 1}
                    column={p.schema.find((c) => c.FieldName === key)}
                    sourceValue={p.row?.[key]}
                />
            ))}
            <div className="json-field json-punctuation">{'}'}</div>
        </div>
    );
}
