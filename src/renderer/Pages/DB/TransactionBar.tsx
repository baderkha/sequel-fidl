import React from 'react';
import { Check, GitBranchPlus, Undo2 } from 'lucide-react';
import { CommitDecision, CommitReview } from './query-file/CommitReview';
import { useElapsed, useTransaction } from './useTransaction';

export type CommitFlow = ReturnType<typeof useCommitFlow>;

/**
 * Begin / commit (with the review) / rollback for the whole window
 */
export function useCommitFlow(conID: string, onChanged?: () => void) {
    const txn = useTransaction();
    const [review, setReview] = React.useState<((d: CommitDecision) => void) | null>(null);

    /** opens the review , resolves with what the user picked (after it ran) */
    const requestCommit = (): Promise<CommitDecision> =>
        new Promise<CommitDecision>((resolve) => setReview(() => resolve)).then(async (decision) => {
            setReview(null);
            let result: CommitDecision = decision;
            if (decision === 'commit') {
                result = (await txn.commit()) ? 'commit' : 'cancel';
            } else if (decision === 'rollback') {
                result = (await txn.rollback()) ? 'rollback' : 'cancel';
            }
            if (result !== 'cancel' && onChanged) {
                onChanged();
            }
            return result;
        });

    const rollback = () => txn.rollback().then((ok) => ok && onChanged && onChanged());

    const reviewElement = review ? (
        <CommitReview conID={conID} startedAt={txn.tx.startedAt} onDecide={review} />
    ) : null;

    return { txn, requestCommit, rollback, reviewElement };
}

/**
 * Title bar controls , visible from every tab
 */
export function TransactionControls({ flow }: { flow: CommitFlow }) {
    const { tx } = flow.txn;
    const elapsed = useElapsed(tx.startedAt, tx.open);
    if (!tx.open) {
        return (
            <button
                type="button"
                className="btn is-ghost tx-begin"
                onClick={() => flow.txn.begin()}
                title="BEGIN , run the next statements in a transaction you can commit or roll back"
            >
                <GitBranchPlus size={13} /> Begin Transaction
            </button>
        );
    }
    return (
        <div className="tx-controls">
            <span className="tx-pill" title="Statements run since BEGIN , from the editor and the grid">
                <span className="tx-dot" />
                {tx.statements} statement{tx.statements === 1 ? '' : 's'} · {elapsed}
            </span>
            <button
                type="button"
                className="btn is-success"
                onClick={() => flow.requestCommit()}
                title="Review what ran , then COMMIT"
            >
                <Check size={13} /> Commit…
            </button>
            <button
                type="button"
                className="btn is-danger-ghost"
                onClick={flow.rollback}
                title="ROLLBACK , discard every change since BEGIN"
            >
                <Undo2 size={13} /> Rollback
            </button>
        </div>
    );
}
