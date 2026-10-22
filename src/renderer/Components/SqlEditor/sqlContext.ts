/**
 * What the cursor position in a SQL statement wants : a table , a column , a keyword ...
 * Pure (no monaco) so it can be tested on its own.
 */

export type TableRef = { table: string; alias?: string };

export type SqlContext = {
    kind:
        | 'none' // inside a string / comment
        | 'start' // beginning of a statement
        | 'table' // after FROM / JOIN / INTO / UPDATE ...
        | 'after-table' // FROM t |  => clause keywords
        | 'column' // SELECT / WHERE / ON / SET ...
        | 'qualified' // alias.|
        | 'insert-columns'; // INSERT INTO t (|
    /** alias / table before the dot */
    qualifier?: string;
    /** INSERT INTO target */
    insertTable?: string;
    /** tables the statement uses (before and after the cursor) */
    scope: TableRef[];
};

const TABLE_KEYWORDS = new Set(['from', 'join', 'into', 'update', 'table', 'describe', 'desc', 'truncate']);
const COLUMN_KEYWORDS = new Set([
    'select', 'where', 'and', 'or', 'on', 'by', 'set', 'having', 'not', 'when', 'then', 'else',
    'case', 'distinct', 'between', 'like', 'in', 'is', 'using', 'values', 'returning',
]);
const CLAUSE_KEYWORDS = new Set([
    'where', 'join', 'inner', 'left', 'right', 'cross', 'outer', 'natural', 'straight_join',
    'on', 'using', 'group', 'order', 'by', 'having', 'limit', 'offset', 'union', 'set', 'values',
    'select', 'from', 'into', 'update', 'delete', 'insert', 'as', 'window', 'for', 'lock', 'procedure',
]);

/** blank out strings and comments (same length) so offsets stay valid */
export function maskSql(sql: string, dialect: 'mysql' | 'postgres' = 'mysql'): { masked: string; openString: boolean } {
    let out = '';
    let i = 0;
    let open = false;
    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];
        const dollar = dialect === 'postgres' && ch === '$' ? sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0] : null;
        if (dollar) {
            const close = sql.indexOf(dollar,i+dollar.length);
            const end = close < 0 ? sql.length : close+dollar.length;
            if (close < 0) open = true;
            out += ' '.repeat(end-i);
            i = end;
        } else if (dialect === 'postgres' && ch === '"') {
            let j = i+1;
            while (j < sql.length) {
                if (sql[j] === '"' && sql[j+1] === '"') j += 2;
                else if (sql[j] === '"') { j++; break; }
                else j++;
            }
            out += sql.slice(i,j);
            i = j;
        } else if (ch === "'" || ch === '"') {
            const escapes = dialect === 'mysql' || (ch === "'" && /[eE]/.test(sql[i-1] || ''));
            let j = i + 1;
            while (j < sql.length && sql[j] !== ch) {
                if (sql[j] === '\\' && escapes) j++;
                j++;
            }
            if (j >= sql.length) open = true;
            out += ch + ' '.repeat(Math.max(0, Math.min(j, sql.length) - i - 1)) + (j < sql.length ? ch : '');
            i = j + 1;
        } else if ((ch === '-' && next === '-') || (dialect === 'mysql' && ch === '#')) {
            let j = i;
            while (j < sql.length && sql[j] !== '\n') j++;
            if (j >= sql.length) open = true;
            out += ' '.repeat(j - i);
            i = j;
        } else if (ch === '/' && next === '*') {
            let end = i+2;
            let depth = 1;
            while (end < sql.length && depth) {
                if (dialect === 'postgres' && sql.slice(end,end+2) === '/*') { depth++; end += 2; }
                else if (sql.slice(end,end+2) === '*/') { depth--; end += 2; }
                else end++;
            }
            if (depth) open = true;
            out += ' '.repeat(end - i);
            i = end;
        } else {
            out += ch;
            i++;
        }
    }
    return { masked: out, openString: open };
}

const unquote = (s: string) => s.replace(/^`|`$|^"|"$/g, '').replace(/""/g,'"').replace(/``/g,'`');
const IDENT = '`(?:``|[^`])+`|"(?:""|[^"])+"|[\\w$]+';
const tableName = (raw: string, dialect: 'mysql' | 'postgres') => {
    const parts = raw.match(new RegExp(IDENT,'g')) || [];
    return dialect === 'postgres' ? parts.map(unquote).join('.') : unquote(parts[parts.length-1] || '');
};

/**
 * Tables a statement references , with aliases
 * handles `FROM a x , b AS y JOIN c ON ...` , `UPDATE t` , `INSERT INTO t` , `DELETE FROM t`
 */
export function tablesInStatement(masked: string, dialect: 'mysql' | 'postgres' = 'mysql'): TableRef[] {
    const refs: TableRef[] = [];
    const ident = IDENT;
    const re = new RegExp(
        `\\b(from|join|update|into)\\s+((?:${ident})(?:\\.(?:${ident}))?)(?:\\s+(?:as\\s+)?(${ident}))?`,
        'gi'
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
        const kw = m[1].toLowerCase();
        const rawTable = m[2].split('.').pop();
        const table = tableName(m[2],dialect);
        let alias = m[3] ? unquote(m[3]) : undefined;
        if (alias && !/^[`"]/.test(m[3]) && CLAUSE_KEYWORDS.has(alias.toLowerCase())) alias = undefined;
        // `order` in backticks is a table , bare ORDER is a keyword
        const quoted = /^[`"]/.test(rawTable);
        if (table && (quoted || !CLAUSE_KEYWORDS.has(table.toLowerCase()))) refs.push({ table, alias });
        // comma separated FROM list
        if (kw === 'from') {
            const rest = masked.slice(re.lastIndex);
            const end = rest.search(/\b(where|join|inner|left|right|cross|natural|group|order|having|limit|union|on|set)\b|;|\)/i);
            const list = end < 0 ? rest : rest.slice(0, end);
            list.split(',')
                .slice(1)
                .forEach((part) => {
                    const p = part.trim().match(new RegExp(`^(${ident})(?:\\s+(?:as\\s+)?(${ident}))?`, 'i'));
                    if (p) refs.push({ table: unquote(p[1]), alias: p[2] ? unquote(p[2]) : undefined });
                });
        }
    }
    // unique by alias / table
    const seen = new Set<string>();
    return refs.filter((r) => {
        const key = `${r.table.toLowerCase()}|${(r.alias || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** bounds of the statement around the cursor (split on ; outside strings / comments) */
function statementBounds(masked: string, offset: number): [number, number] {
    const before = masked.lastIndexOf(';', offset - 1);
    const after = masked.indexOf(';', offset);
    return [before + 1, after < 0 ? masked.length : after];
}

/**
 * @param text whole editor text
 * @param offset cursor offset
 */
export function analyze(text: string, offset: number, dialect: 'mysql' | 'postgres' = 'mysql'): SqlContext {
    const { masked } = maskSql(text,dialect);
    const [start, end] = statementBounds(masked, offset);
    const statement = masked.slice(start, end);
    const before = masked.slice(start, offset);
    const scope = tablesInStatement(statement,dialect);

    // inside a string or comment : the masked text differs from the real one at the cursor
    const { openString } = maskSql(text.slice(start, offset),dialect);
    if (openString) {
        return { kind: 'none', scope };
    }

    // alias.partial
    const dot = before.match(new RegExp(`(${IDENT})\\.([\\w$]*)$`));
    if (dot) {
        return { kind: 'qualified', qualifier: unquote(dot[1]), scope };
    }

    // drop the word being typed , then look at what precedes it
    const head = before.replace(/[\w$`]*$/, '');
    const tokens = head.match(new RegExp(`${IDENT}|[(),=<>!+\\-*/]+`,'g')) || [];
    if (!tokens.length) {
        return { kind: 'start', scope };
    }

    // INSERT INTO t ( ... | )
    const insert = head.match(new RegExp(`\\binsert\\s+(?:ignore\\s+)?into\\s+((?:${IDENT})(?:\\.(?:${IDENT}))?)\\s*\\(([^)]*)$`,'i'));
    if (insert) {
        return { kind: 'insert-columns', insertTable: tableName(insert[1],dialect), scope };
    }

    const last = tokens[tokens.length - 1].toLowerCase();
    const prev = tokens.length > 1 ? tokens[tokens.length - 2].toLowerCase() : '';

    if (TABLE_KEYWORDS.has(last)) {
        return { kind: 'table', scope };
    }
    // FROM a , |  (still in the table list)
    if (last === ',') {
        const lastKw = [...tokens].reverse().find((t) => /^[a-z_]+$/i.test(t) && (TABLE_KEYWORDS.has(t.toLowerCase()) || COLUMN_KEYWORDS.has(t.toLowerCase()) || CLAUSE_KEYWORDS.has(t.toLowerCase())));
        if (lastKw && lastKw.toLowerCase() === 'from') {
            return { kind: 'table', scope };
        }
        return { kind: 'column', scope };
    }
    if (COLUMN_KEYWORDS.has(last) || /^[(=<>!+\-*/,]+$/.test(last)) {
        return { kind: 'column', scope };
    }
    // FROM t |  or  FROM t alias |  => clause keywords next
    if (TABLE_KEYWORDS.has(prev) || (tokens.length > 2 && TABLE_KEYWORDS.has(tokens[tokens.length - 3].toLowerCase()))) {
        return { kind: 'after-table', scope };
    }
    // `SELECT a |` / `WHERE x = 1 |` : most likely a keyword or another column
    return { kind: 'column', scope };
}

/** identifiers that need backticks */
export const needsQuoting = (name: string) =>
    !/^[A-Za-z_][\w$]*$/.test(name) ||
    /^(select|from|where|order|group|table|key|index|limit|desc|asc|by|join|on|and|or|not|in|is|null|user|status|date|time|year|month|day|name|value|values|default|primary|check|column|database|schema|range|rank|row|rows|window|interval|match|condition|signal|read|write|lock|option|release|return|update|delete|insert|create|drop|alter|use|show|set|case|when|then|else|end|like|between|exists|having|union|distinct|all|any|as|into|to|with)$/i.test(
        name
    );

export const quoteIdent = (name: string) => (needsQuoting(name) ? `\`${name.replace(/`/g, '``')}\`` : name);
