import React from 'react';
import { Check, CircleAlert, GitCommitHorizontal, Undo2 } from 'lucide-react';
import { api, TxLogEntry } from 'renderer/api';
import { Modal } from 'renderer/Components/ui/Modal';

export type CommitDecision = 'commit' | 'rollback' | 'cancel';

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

const ago = (since: number) => {
    const s = Math.max(0, Math.round((Date.now() - since) / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** what a statement did , in words */
const outcome = (e: TxLogEntry) => {
    if (e.error) return `failed: ${e.error}`;
    switch (e.op) {
        case 'INSERT':
            return `${plural(e.affected || 0, 'row')} inserted${e.insertId ? ` · id ${e.insertId}` : ''}`;
        case 'UPDATE':
            return e.changed !== undefined && e.changed !== e.affected
                ? `${plural(e.affected || 0, 'row')} matched · ${e.changed} changed`
                : `${plural(e.affected || 0, 'row')} updated`;
        case 'DELETE':
            return `${plural(e.affected || 0, 'row')} deleted`;
        default:
            return e.rows !== undefined ? `${plural(e.rows, 'row')} returned` : 'ok';
    }
};

/** a statement that actually changed rows */
const isWrite = (e: TxLogEntry) =>
    !e.error && ['INSERT', 'UPDATE', 'DELETE'].includes(e.op) && (e.affected || 0) > 0;

/**
 * Review what ran in the transaction before committing it
 */
export function CommitReview(p: {
    conID: string;
    startedAt: number;
    onDecide: (decision: CommitDecision) => void;
}) {
    const [log, setLog] = React.useState<TxLogEntry[] | null>(null);
    const [expanded, setExpanded] = React.useState<number | null>(null);

    React.useEffect(() => {
        api.transactionLog(p.conID).then((l) => setLog(l || []));
    }, [p.conID]);

    const writes = (log || []).filter(isWrite);
    const failed = (log || []).filter((e) => e.error);
    const byTable = new Map<string, { inserted: number; updated: number; deleted: number }>();
    writes.forEach((e) => {
        const t = byTable.get(e.table || '?') || { inserted: 0, updated: 0, deleted: 0 };
        const n = e.op === 'UPDATE' ? e.changed ?? e.affected ?? 0 : e.affected ?? 0;
        if (e.op === 'INSERT') t.inserted += n;
        if (e.op === 'UPDATE') t.updated += n;
        if (e.op === 'DELETE') t.deleted += n;
        byTable.set(e.table || '?', t);
    });

    return (
        <Modal
            open
            wide
            icon={<GitCommitHorizontal size={16} />}
            title="Review & commit transaction"
            onClose={() => p.onDecide('cancel')}
            onSubmit={() => p.onDecide('commit')}
            footer={
                <>
                    <button type="button" className="btn is-danger-ghost" onClick={() => p.onDecide('rollback')}>
                        <Undo2 size={13} /> Roll Back Instead
                    </button>
                    <div className="toolbar-spacer" />
                    <button type="button" className="btn is-ghost" onClick={() => p.onDecide('cancel')}>
                        Cancel
                    </button>
                    <button type="submit" className="btn is-success" autoFocus disabled={!log}>
                        <Check size={13} /> Commit
                    </button>
                </>
            }
        >
            {!log ? (
                <div className="ct-hint">Loading…</div>
            ) : (
                <>
                    <div className="commit-summary">
                        Started {ago(p.startedAt)} ago · {plural(log.length, 'statement')}
                        {writes.length ? ` · ${writes.length} changed data` : ' · no data changed'}
                        {failed.length ? (
                            <span className="status-err"> · {failed.length} failed</span>
                        ) : null}
                    </div>
                    {byTable.size > 0 && (
                        <div className="commit-tables">
                            {Array.from(byTable.entries()).map(([table, c]) => (
                                <span key={table} className="commit-table">
                                    <code>{table}</code>
                                    {c.inserted > 0 && <span className="chg is-ins">+{c.inserted} inserted</span>}
                                    {c.updated > 0 && <span className="chg is-upd">~{c.updated} updated</span>}
                                    {c.deleted > 0 && <span className="chg is-del">−{c.deleted} deleted</span>}
                                </span>
                            ))}
                        </div>
                    )}
                    {log.length ? (
                        <div className="commit-list">
                            {log.map((e, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <div key={i} className={`commit-item ${e.error ? 'is-failed' : ''}`}>
                                    <div className="commit-item-head">
                                        <span className="commit-num">{i + 1}</span>
                                        <span className={`op-badge is-${e.op.toLowerCase()}`}>{e.op}</span>
                                        {e.table && <code>{e.table}</code>}
                                        <span className={`commit-outcome ${e.error ? 'status-err' : ''}`}>
                                            {e.error && <CircleAlert size={12} />} {outcome(e)}
                                        </span>
                                        <span className="commit-source">{e.source === 'grid' ? 'from grid' : 'editor'}</span>
                                    </div>
                                    <pre
                                        className={`commit-sql ${expanded === i ? 'is-open' : ''}`}
                                        title={expanded === i ? '' : 'Click to show the whole statement'}
                                        onClick={() => setExpanded(expanded === i ? null : i)}
                                    >
                                        {e.sql}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="ct-hint">No statements ran in this transaction , committing changes nothing.</div>
                    )}
                    {failed.length > 0 && (
                        <div className="ct-hint">
                            Failed statements didn't change anything , MySQL only undid that one statement.
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}
