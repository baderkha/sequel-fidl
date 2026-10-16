import React from 'react';
import { useAtom } from 'jotai';
import { api, onMainEvent } from 'renderer/api';
import { ConID, TxStateAtom } from 'renderer/State';
import { useToast } from 'renderer/Components/ui/Toasts';

const CLOSED = { open: false, startedAt: 0, statements: 0 };

/**
 * Explicit transaction of this window's connection
 */
export function useTransaction() {
    const [conID] = useAtom(ConID);
    const [tx, setTx] = useAtom(TxStateAtom);
    const notify = useToast();

    const begin = async () => {
        const err = await api.beginTransaction(conID);
        if (err) {
            notify(err.message, 'error');
            return false;
        }
        setTx({ open: true, startedAt: Date.now(), statements: 0 });
        return true;
    };
    const end = async (commit: boolean) => {
        const n = tx.statements;
        const err = commit ? await api.commitTransaction(conID) : await api.rollbackTransaction(conID);
        setTx(CLOSED);
        if (err) {
            notify(err.message, 'error');
            return false;
        }
        notify(
            commit
                ? `Committed${n ? ` ${n} statement${n === 1 ? '' : 's'}` : ''}`
                : `Rolled back${n ? ` ${n} statement${n === 1 ? '' : 's'}` : ''}`,
            'success'
        );
        return true;
    };

    return {
        tx,
        begin,
        commit: () => end(true),
        rollback: () => end(false),
        /** the main process committed it (implicit commit) */
        markClosed: () => setTx(CLOSED),
    };
}

/**
 * Keep the window's transaction state in sync with the main process (mount once per window)
 */
export function useTransactionSync() {
    const [conID] = useAtom(ConID);
    const [, setTx] = useAtom(TxStateAtom);
    const notify = useToast();
    React.useEffect(() => {
        if (!conID) {
            return undefined;
        }
        api.transactionState(conID).then((s) =>
            setTx(s.open ? { open: true, startedAt: s.startedAt, statements: s.statements || 0 } : CLOSED)
        );
        const off = onMainEvent<{
            conID: string;
            open: boolean;
            startedAt: number;
            statements?: number;
            reason?: string;
        }>(
            'transaction_state',
            (ev) => {
                if (ev.conID !== conID) {
                    return;
                }
                if (!ev.open) {
                    setTx(CLOSED);
                    if (ev.reason) {
                        notify(ev.reason, 'error');
                    }
                } else {
                    // the main process logs editor and grid statements , it owns the count
                    setTx({ open: true, startedAt: ev.startedAt, statements: ev.statements || 0 });
                }
            }
        );
        return () => {
            off && off();
        };
    }, [conID]);
}

/** m:ss since the transaction began , ticking */
export function useElapsed(since: number, active: boolean) {
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        if (!active) {
            return undefined;
        }
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [active]);
    const s = Math.max(0, Math.floor((now - since) / 1000));
    return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
}
