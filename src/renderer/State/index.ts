import { atom, PrimitiveAtom } from 'jotai';
import type { SessionInfo } from 'renderer/api';

/** the live connection the workspace is showing , null => welcome screen */
export const SessionState = atom(null) as unknown as PrimitiveAtom<SessionInfo | null>;

/** connection id of the current session */
export const ConID = atom((get) => get(SessionState)?.conID || '');

/** explicit transaction of this window's connection */
export type TxState = {
    open: boolean;
    startedAt: number;
    /** statements run since BEGIN */
    statements: number;
};
export const TxStateAtom = atom({ open: false, startedAt: 0, statements: 0 }) as unknown as PrimitiveAtom<TxState>;
