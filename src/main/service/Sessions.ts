/**
 * What a live connection id belongs to , so disconnecting can clean up after it
 */
export type SessionKind = 'direct' | 'playground';

export type SessionInfo = {
    conID: string;
    kind: SessionKind;
    /** saved connection id / playground id , undefined for an unsaved direct connection */
    refId?: number;
    label: string;
};

const sessions = new Map<string, SessionInfo>();

export const Sessions = {
    add: (s: SessionInfo) => sessions.set(s.conID, s),
    get: (conID: string) => sessions.get(conID),
    remove: (conID: string) => sessions.delete(conID),
    forRef: (kind: SessionKind, refId: number) =>
        Array.from(sessions.values()).filter(
            (s) => s.kind === kind && s.refId === refId
        ),
};
