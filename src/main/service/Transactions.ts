import { Sequelize, Transaction } from 'sequelize';
import { broadcast } from '../util/broadcast';

/**
 * Explicit transactions , one per live connection.
 * Sequelize hands every query a pooled connection , so BEGIN / COMMIT typed as plain queries
 * don't work. A transaction here pins one pooled connection , every query of that session
 * runs on it until commit / rollback.
 */

export const TRANSACTION_STATE_EV = 'transaction_state';

export type TransactionInfo = {
    open: boolean;
    startedAt: number;
    /** statements logged since BEGIN (editor + grid) */
    statements?: number;
    /** why it ended when the server ended it (deadlock , lost connection) */
    reason?: string;
};

/** one statement that ran inside a transaction , for the review before commit */
export type TxLogEntry = {
    sql: string;
    /** INSERT / UPDATE / DELETE / SELECT / ... */
    op: string;
    table?: string;
    source: 'editor' | 'grid';
    at: number;
    /** rows written (insert / update / delete) */
    affected?: number;
    /** rows whose values actually changed (update) */
    changed?: number;
    insertId?: number;
    /** rows returned (select) */
    rows?: number;
    error?: string;
};

type Open = { t: Transaction; startedAt: number; log: TxLogEntry[] };

const open = new Map<string, Open>();

const STATEMENT = /^\s*(insert(?:\s+ignore)?\s+into|replace\s+into|update(?:\s+ignore)?|delete(?:\s+ignore)?\s+from|select|with|show|describe|desc|explain|call|set|savepoint|release\s+savepoint|rollback\s+to)\b\s*`?([\w$]+)?`?/i;

/** op + table of a statement typed in the editor */
export const describeStatement = (sql: string): { op: string; table?: string } => {
    const m = sql.replace(/^(\s*(--[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/))*/, '').match(STATEMENT);
    if (!m) {
        return { op: (sql.trim().split(/\s+/)[0] || 'SQL').toUpperCase() };
    }
    const word = m[1].toLowerCase();
    const op = word.startsWith('insert') || word.startsWith('replace')
        ? 'INSERT'
        : word.startsWith('update')
        ? 'UPDATE'
        : word.startsWith('delete')
        ? 'DELETE'
        : word.startsWith('rollback') || word.includes('savepoint')
        ? 'SAVEPOINT'
        : word === 'with'
        ? 'SELECT'
        : word.toUpperCase();
    const writes = op === 'INSERT' || op === 'UPDATE' || op === 'DELETE';
    return { op, table: writes ? m[2] : undefined };
};

/**
 * Statements MySQL commits implicitly (and so end the transaction)
 * https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html
 */
const IMPLICIT_COMMIT = /^\s*(create|alter|drop|truncate|rename|grant|revoke|lock\s+tables|unlock\s+tables|load\s+data|analyze|optimize|repair|cache\s+index|flush|install|uninstall|set\s+(global\s+)?(autocommit|password)|begin|start\s+transaction)\b/i;

/** strip leading comments so `-- note\nCREATE ...` is still recognised */
const stripLeadingComments = (sql: string) =>
    sql.replace(/^(\s*(--[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/))*/, '');

export const commitsImplicitly = (sql: string) => IMPLICIT_COMMIT.test(stripLeadingComments(sql));

const announce = (conID: string, reason?: string) => {
    const tx = open.get(conID);
    const info: TransactionInfo = {
        open: !!tx,
        startedAt: tx?.startedAt || 0,
        statements: tx?.log.length || 0,
        reason,
    };
    broadcast(TRANSACTION_STATE_EV, { conID, ...info });
};

export const Transactions = {
    get: (conID: string): Transaction | undefined => open.get(conID)?.t,

    isOpen: (conID: string) => open.has(conID),

    openIds: () => Array.from(open.keys()),

    /** what ran since BEGIN */
    log: (conID: string): TxLogEntry[] => open.get(conID)?.log || [],

    record(conID: string, entry: Omit<TxLogEntry, 'at'>) {
        const tx = open.get(conID);
        if (tx) {
            tx.log.push({ ...entry, at: Date.now() });
            announce(conID);
        }
    },

    info: (conID: string): TransactionInfo => {
        const tx = open.get(conID);
        return { open: !!tx, startedAt: tx?.startedAt || 0, statements: tx?.log.length || 0 };
    },

    async begin(con: Sequelize, conID: string): Promise<Error | null> {
        if (open.has(conID)) {
            return new Error('A transaction is already open');
        }
        try {
            const t = await con.transaction();
            open.set(conID, { t, startedAt: Date.now(), log: [] });
            announce(conID);
            return null;
        } catch (err) {
            return err as Error;
        }
    },

    async commit(conID: string): Promise<Error | null> {
        const tx = open.get(conID);
        if (!tx) {
            return new Error('No transaction is open');
        }
        try {
            await tx.t.commit();
            return null;
        } catch (err) {
            return err as Error;
        } finally {
            open.delete(conID);
            announce(conID);
        }
    },

    async rollback(conID: string): Promise<Error | null> {
        const tx = open.get(conID);
        if (!tx) {
            return new Error('No transaction is open');
        }
        try {
            await tx.t.rollback();
            return null;
        } catch (err) {
            return err as Error;
        } finally {
            open.delete(conID);
            announce(conID);
        }
    },

    /**
     * The server ended the transaction on its own (deadlock) or the connection is gone ,
     * release it and tell the window why
     */
    async drop(conID: string, reason: string) {
        const tx = open.get(conID);
        if (!tx) {
            return;
        }
        open.delete(conID);
        await tx.t.rollback().catch(() => {});
        announce(conID, reason);
    },
};

/** errors after which InnoDB has already rolled the whole transaction back */
export const endsTransaction = (err: any) => {
    const errno = err?.original?.errno ?? err?.parent?.errno ?? err?.errno;
    return errno === 1213; // ER_LOCK_DEADLOCK
};
