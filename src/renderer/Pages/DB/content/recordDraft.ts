import type { ColSchema } from 'renderer/api';
import type { GridDraftCell } from 'renderer/Components/DataGrid/DraftRow';
import {
    isJSONColumn,
    parseDocumentJSON,
    readOnlyField,
} from './documentValues';

export type RecordDraft = Record<string, GridDraftCell>;
export type RecordInsert = { columns: string[]; values: any[] };

export const newRecordDraft = (schema: ColSchema[]): RecordDraft =>
    Object.fromEntries(
        schema.map((column) => [
            column.FieldName,
            {
                mode: 'default',
                value: '',
                nullable: column.NullAllowed,
                hasDefault:
                    column.Default !== null && column.Default !== undefined,
                readOnly: column.AutoIncrement
                    ? 'Auto'
                    : readOnlyField(undefined, column)
                    ? 'Generated'
                    : undefined,
            },
        ])
    );

/** Omit untouched fields so defaults and sequence-generated IDs stay on the server. */
export function recordInsert(
    schema: ColSchema[],
    draft: RecordDraft
): RecordInsert {
    const columns: string[] = [];
    const values: any[] = [];
    for (const column of schema) {
        const cell = draft[column.FieldName];
        if (!cell || cell.readOnly) continue;
        if (cell.mode === 'default') {
            if (!cell.hasDefault && !cell.nullable)
                throw new Error(`Enter a value for "${column.FieldName}".`);
            continue;
        }
        let value: any = cell.value;
        if (cell.mode === 'null') {
            if (!column.NullAllowed)
                throw new Error(
                    `Column "${column.FieldName}" does not allow NULL.`
                );
            value = null;
        } else if (isJSONColumn(column)) {
            try {
                JSON.parse(value);
            } catch (e) {
                throw new Error(`Enter valid JSON for "${column.FieldName}".`);
            }
            // Keep the original text so large JSON numbers are never rounded by JavaScript.
        } else if (/\[\]$/.test(column.Type)) {
            try {
                value = parseDocumentJSON(value);
                if (!Array.isArray(value)) throw new Error();
            } catch (e) {
                throw new Error(
                    `Enter a JSON array for "${column.FieldName}" (quote large integers).`
                );
            }
        } else if (/^bool(?:ean)?\b/i.test(column.Type)) {
            if (!/^(true|false|t|f|1|0)$/i.test(value.trim()))
                throw new Error(
                    `Enter true or false for "${column.FieldName}".`
                );
            value = /^(true|t|1)$/i.test(value.trim());
        }
        columns.push(column.FieldName);
        values.push(value);
    }
    return { columns, values };
}
