import * as monaco from 'monaco-editor';
import { DatabaseType,quoteIdentifier,quoteTable } from 'shared/db/dialects';
import { format } from 'sql-formatter';
import type { AppTheme } from 'renderer/theme/themes';
import { analyze, quoteIdent as mysqlQuoteIdent, TableRef } from './sqlContext';

export { monaco };

export const SQL_LANGUAGE = 'mysql';

export type CompletionColumn = { name: string; type: string; pk: boolean };
export type CompletionTable = { name: string; type: 'table' | 'view' };

/**
 * Whatever the completion provider needs to know about the current connection ,
 * set by the editor component
 */
export type CompletionSource = {
    tables: CompletionTable[];
    getColumns: (table: string) => Promise<CompletionColumn[]>;
};

let completionSource: CompletionSource = {
    tables: [],
    getColumns: () => Promise.resolve([]),
};

export const setCompletionSource = (src: CompletionSource) => {
    completionSource = src;
};

const STATEMENT_KEYWORDS = [
    'SELECT', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'WITH', 'SHOW TABLES', 'SHOW DATABASES',
    'DESCRIBE', 'EXPLAIN', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'BEGIN',
    'COMMIT', 'ROLLBACK', 'USE',
];
const CLAUSE_KEYWORDS = [
    'WHERE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'AS', 'ORDER BY', 'GROUP BY',
    'HAVING', 'LIMIT', 'SET', 'VALUES', 'UNION',
];
const EXPRESSION_KEYWORDS = [
    'FROM', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'BETWEEN', 'AS', 'DISTINCT',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'ORDER BY', 'GROUP BY', 'LIMIT', 'NULL',
];

const FUNCTIONS = [
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL', 'NULLIF', 'IF',
    'CONCAT', 'CONCAT_WS', 'GROUP_CONCAT', 'LENGTH', 'CHAR_LENGTH', 'LOWER',
    'UPPER', 'TRIM', 'SUBSTRING', 'REPLACE', 'NOW', 'CURDATE', 'CURTIME',
    'DATE', 'DATE_FORMAT', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'UNIX_TIMESTAMP',
    'FROM_UNIXTIME', 'YEAR', 'MONTH', 'DAY', 'ROUND', 'FLOOR', 'CEIL', 'ABS',
    'CAST', 'CONVERT', 'JSON_EXTRACT', 'JSON_OBJECT', 'JSON_ARRAY', 'UUID',
];

const registered = new Set<DatabaseType>();

/**
 * Register the formatter + completion providers , only once per window
 */
export function registerSqlFeatures(dialect: DatabaseType = 'mysql') {
    const language = dialect === 'postgres' ? 'pgsql' : 'mysql';
    const quoteIdent = (name: string) => dialect === 'postgres' ? quoteIdentifier(name,dialect) : mysqlQuoteIdent(name);
    if (registered.has(dialect)) {
        return;
    }
    registered.add(dialect);

    const formatSql = (text: string, tabSize: number) =>
        format(text, {
            language: dialect === 'postgres' ? 'postgresql' : 'mysql',
            keywordCase: 'upper',
            tabWidth: tabSize,
        });

    monaco.languages.registerDocumentFormattingEditProvider(language, {
        provideDocumentFormattingEdits: (model, options) => [
            {
                range: model.getFullModelRange(),
                text: formatSql(model.getValue(), options.tabSize),
            },
        ],
    });

    monaco.languages.registerDocumentRangeFormattingEditProvider(language, {
        provideDocumentRangeFormattingEdits: (model, range, options) => [
            {
                range,
                text: formatSql(model.getValueInRange(range), options.tabSize),
            },
        ],
    });

    monaco.languages.registerCompletionItemProvider(language, {
        // `.` for alias.column , space only matters right after FROM / JOIN ... (see below)
        triggerCharacters: ['.', ' ', '('],
        provideCompletionItems: async (model, position, context) => {
            const ctx = analyze(model.getValue(), model.getOffsetAt(position),dialect);
            // polite : a space only opens the list where a table name is expected
            if (
                context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter &&
                ((context.triggerCharacter === ' ' && ctx.kind !== 'table') ||
                    (context.triggerCharacter === '(' && ctx.kind !== 'insert-columns'))
            ) {
                return { suggestions: [] };
            }
            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            const { tables, getColumns } = completionSource;
            const Kind = monaco.languages.CompletionItemKind;
            const known = (name: string) => tables.find((t) => t.name.toLowerCase() === (dialect === 'postgres' ? name.replace(/^public\./,'') : name).toLowerCase());

            const tableItems = (prefix: string): monaco.languages.CompletionItem[] =>
                tables.map((t) => ({
                    label: { label: t.name, description: t.type },
                    kind: t.type === 'view' ? Kind.Interface : Kind.Struct,
                    detail: t.type,
                    insertText: dialect === 'postgres' ? quoteTable(t.name,dialect) : quoteIdent(t.name),
                    filterText: t.name,
                    sortText: `${prefix}${t.name}`,
                    range,
                }));
            // keywords keep the order of their list (most useful first)
            const keywordItems = (list: string[], prefix: string): monaco.languages.CompletionItem[] =>
                list.map((k, i) => ({
                    label: k,
                    kind: Kind.Keyword,
                    insertText: k,
                    sortText: `${prefix}${`${i}`.padStart(3, '0')}`,
                    range,
                }));
            const functionItems = (): monaco.languages.CompletionItem[] =>
                (dialect === 'postgres' ? ['COUNT','SUM','AVG','MIN','MAX','COALESCE','NULLIF','STRING_AGG','ARRAY_AGG','JSONB_AGG','JSONB_BUILD_OBJECT','TO_CHAR','DATE_TRUNC','EXTRACT','NOW','GENERATE_SERIES','LENGTH','LOWER','UPPER','ROUND','CAST','UNNEST'] : FUNCTIONS).map((f) => ({
                    label: `${f}()`,
                    kind: Kind.Function,
                    insertText: `${f}($0)`,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    sortText: `9${f}`,
                    range,
                }));
            /** columns of the given tables , qualified when two tables share a name */
            const columnItems = async (refs: TableRef[], qualify: boolean): Promise<monaco.languages.CompletionItem[]> => {
                const sets = await Promise.all(
                    refs.map(async (r, i) => {
                        const t = known(r.table);
                        return { ref: r, i, cols: t ? await getColumns(t.name) : [] };
                    })
                );
                const count = new Map<string, number>();
                sets.forEach((s) => s.cols.forEach((c) => count.set(c.name.toLowerCase(), (count.get(c.name.toLowerCase()) || 0) + 1)));
                return sets.flatMap(({ ref, i, cols }) =>
                    cols.map((c, ordinal) => {
                        const owner = ref.alias || ref.table;
                        const ambiguous = qualify && (count.get(c.name.toLowerCase()) || 0) > 1;
                        return {
                            label: { label: c.name, detail: c.pk ? '  🔑' : '', description: `${c.type} · ${owner}` },
                            kind: c.pk ? Kind.Constant : Kind.Field,
                            detail: `${c.type}${c.pk ? ' · primary key' : ''} · ${ref.table}`,
                            insertText: ambiguous ? `${dialect === 'postgres' && !ref.alias ? quoteTable(owner,dialect) : quoteIdent(owner)}.${quoteIdent(c.name)}` : quoteIdent(c.name),
                            filterText: c.name,
                            // primary key first , then the table's own column order
                            sortText: `0${i}${c.pk ? '0' : '1'}${`${ordinal}`.padStart(4, '0')}`,
                            range,
                        } as monaco.languages.CompletionItem;
                    })
                );
            };

            let suggestions: monaco.languages.CompletionItem[] = [];
            switch (ctx.kind) {
                case 'none':
                    break;
                case 'start':
                    suggestions = keywordItems(dialect === 'postgres' ? STATEMENT_KEYWORDS.filter((k) => !/^(SHOW|USE|DESCRIBE)/.test(k)) : STATEMENT_KEYWORDS, '0');
                    break;
                case 'table':
                    suggestions = tableItems('0');
                    break;
                case 'after-table':
                    suggestions = keywordItems(CLAUSE_KEYWORDS, '0');
                    break;
                case 'insert-columns':
                    suggestions = await columnItems([{ table: ctx.insertTable }], false);
                    break;
                case 'qualified': {
                    const q = ctx.qualifier.toLowerCase();
                    const ref =
                        ctx.scope.find((r) => (r.alias || '').toLowerCase() === q) ||
                        ctx.scope.find((r) => r.table.toLowerCase() === q) ||
                        (known(ctx.qualifier) ? { table: ctx.qualifier } : null);
                    suggestions = ref ? await columnItems([{ table: ref.table }], false) : [];
                    break;
                }
                default: {
                    // column context : the statement's columns first , then its aliases
                    const inScope = ctx.scope.filter((r) => known(r.table));
                    if (inScope.length) {
                        suggestions = [
                            ...(await columnItems(inScope, inScope.length > 1)),
                            ...inScope.map((r) => ({
                                label: { label: r.alias || r.table, description: r.alias ? `alias of ${r.table}` : 'table' },
                                kind: Kind.Variable,
                                insertText: quoteIdent(r.alias || r.table),
                                sortText: `1${r.alias || r.table}`,
                                range,
                            })),
                            ...keywordItems(EXPRESSION_KEYWORDS, '8'),
                            ...functionItems(),
                        ];
                    } else {
                        // no FROM yet : offer tables so `table.column` works
                        suggestions = [...tableItems('0'), ...keywordItems(EXPRESSION_KEYWORDS, '8'), ...functionItems()];
                    }
                }
            }
            return { suggestions };
        },
    });
}

/** monaco wants #rrggbb(aa) , theme tokens may be rgba() */
const toHex = (color: string): string => {
    if (color.startsWith('#')) {
        return color;
    }
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) {
        return color;
    }
    const [r, g, b, a = '1'] = m[1].split(',').map((v) => v.trim());
    const hex = (n: number) =>
        Math.round(Math.max(0, Math.min(255, n)))
            .toString(16)
            .padStart(2, '0');
    return `#${hex(+r)}${hex(+g)}${hex(+b)}${hex(parseFloat(a) * 255)}`;
};

const strip = (hex: string) => toHex(hex).replace('#', '');

/**
 * Build a monaco theme from an app theme and activate it
 * @param theme
 */
export function applyMonacoTheme(theme: AppTheme) {
    const { colors: c, syntax: s } = theme;
    const name = `sequel-fidl-${theme.id}`;
    monaco.editor.defineTheme(name, {
        base: theme.kind === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [
            { token: '', foreground: strip(s.identifier) },
            { token: 'keyword', foreground: strip(s.keyword) },
            { token: 'operator', foreground: strip(s.operator) },
            { token: 'string', foreground: strip(s.string) },
            { token: 'number', foreground: strip(s.number) },
            { token: 'comment', foreground: strip(s.comment), fontStyle: 'italic' },
            { token: 'predefined', foreground: strip(s.predefined) },
            { token: 'identifier', foreground: strip(s.identifier) },
            { token: 'identifier.quote', foreground: strip(s.type) },
            { token: 'type', foreground: strip(s.type) },
            { token: 'delimiter', foreground: strip(s.delimiter) },
        ],
        colors: {
            'editor.background': toHex(c.surface),
            'editor.foreground': toHex(c.text),
            'editorGutter.background': toHex(c.surface),
            'editorLineNumber.foreground': toHex(c.textFaint),
            'editorLineNumber.activeForeground': toHex(c.textMuted),
            'editor.lineHighlightBackground': toHex(c.hover),
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': toHex(c.selection),
            'editor.inactiveSelectionBackground': toHex(c.accentSoft),
            'editorCursor.foreground': toHex(c.accent),
            'editorIndentGuide.background1': toHex(c.border),
            'editorWidget.background': toHex(c.surfaceOverlay),
            'editorWidget.border': toHex(c.borderStrong),
            'editorSuggestWidget.background': toHex(c.surfaceOverlay),
            'editorSuggestWidget.border': toHex(c.borderStrong),
            'editorSuggestWidget.selectedBackground': toHex(c.accentSoft),
            'editorSuggestWidget.highlightForeground': toHex(c.accent),
            'editorHoverWidget.background': toHex(c.surfaceOverlay),
            'editorHoverWidget.border': toHex(c.borderStrong),
            'scrollbarSlider.background': toHex(c.scrollbar),
            'scrollbarSlider.hoverBackground': toHex(c.scrollbarHover),
            'scrollbarSlider.activeBackground': toHex(c.scrollbarHover),
            'focusBorder': '#00000000',
            'input.background': toHex(c.inputBg),
            'input.border': toHex(c.borderStrong),
        },
    });
    monaco.editor.setTheme(name);
}
