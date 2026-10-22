export type Statement = {
    /** offset of the first char (comments / whitespace before it are skipped) */
    start: number;
    /** offset after the last char , excluding the ; */
    end: number;
    text: string;
};

/**
 * Split sql into statements on `;` , ignoring the ones inside quotes and comments
 * @param sql
 */
export function splitStatements(sql: string, dialect: 'mysql' | 'postgres' = 'mysql'): Statement[] {
    const out: Statement[] = [];
    let segStart = 0;
    let i = 0;
    const push = (endExclusive: number) => {
        const raw = sql.slice(segStart, endExclusive);
        const lead = raw.length - raw.trimStart().length;
        const text = raw.trim();
        if (text && stripComments(text).trim()) {
            out.push({
                start: segStart + lead,
                end: segStart + lead + text.length,
                text,
            });
        }
    };
    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];
        const dollar = dialect === 'postgres' && ch === '$' ? sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0] : null;
        if (dollar) {
            const end = sql.indexOf(dollar, i + dollar.length);
            i = end < 0 ? sql.length : end + dollar.length;
        } else if (ch === "'" || ch === '"' || ch === '`') {
            const backslashEscapes = dialect === 'mysql' || (ch === "'" && /[eE]/.test(sql[i-1] || ''));
            i++;
            while (i < sql.length && sql[i] !== ch) {
                if (sql[i] === '\\' && ch !== '`' && backslashEscapes) {
                    i++;
                }
                i++;
            }
            i++;
        } else if ((ch === '-' && next === '-') || (dialect === 'mysql' && ch === '#')) {
            while (i < sql.length && sql[i] !== '\n') {
                i++;
            }
        } else if (ch === '/' && next === '*') {
            let depth = 1;
            i += 2;
            while (i < sql.length && depth) {
                if (dialect === 'postgres' && sql.slice(i,i+2) === '/*') { depth++; i += 2; }
                else if (sql.slice(i,i+2) === '*/') { depth--; i += 2; }
                else i++;
            }
        } else if (ch === ';') {
            push(i);
            i++;
            segStart = i;
        } else {
            i++;
        }
    }
    push(sql.length);
    return out;
}

const stripComments = (sql: string) =>
    sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--|#)[^\n]*/g, '');

/**
 * The statement the cursor is in , or the closest one before it
 * @param sql
 * @param offset cursor offset
 */
export function statementAt(sql: string, offset: number, dialect: 'mysql' | 'postgres' = 'mysql'): Statement | null {
    const stmts = splitStatements(sql,dialect);
    if (!stmts.length) {
        return null;
    }
    // the cursor counts as inside a statement up to (and including) its ;
    const hit = stmts.find((s) => offset >= s.start && offset <= s.end + 1);
    if (hit) {
        return hit;
    }
    const before = stmts.filter((s) => s.end <= offset);
    return before.length ? before[before.length - 1] : stmts[0];
}
