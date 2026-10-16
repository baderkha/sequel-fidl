import { QueryTypes } from 'sequelize';
import { ConManager } from '../Connections';
import { PlaygroundService } from '../PlaygroundService';
import { Sessions } from '../Sessions';
import { ErrorTuple, NewErrorTuple } from '../../util/tuple';

/**
 * Everything a mysql client needs to reach the server a window is connected to ,
 * read from the live connection so it follows database switches
 */
export type MySQLTarget = {
    host: string;
    port: number;
    user: string;
    password: string;
    /** current database , '' when none */
    database: string;
    /** e.g. 8.4.11 / 10.11.6-MariaDB */
    serverVersion: string;
    isMariaDB: boolean;
    /** docker container running the server (playgrounds) */
    container?: string;
};

export async function resolveMySQLTarget(conID: string | null): Promise<ErrorTuple<MySQLTarget>> {
    const [, con] = conID ? ConManager.GetInstance().GetConById(conID) : [null, null];
    if (!con) {
        return NewErrorTuple(null, new Error('This window has no live database connection.'));
    }
    const cfg = con.config;
    let serverVersion = '';
    try {
        const rows = await con.query<{ v: string }>('SELECT VERSION() AS v', { type: QueryTypes.SELECT });
        serverVersion = rows[0]?.v || '';
    } catch (err) {
        return NewErrorTuple(null, new Error(`The connection isn't responding: ${(err as Error).message}`));
    }
    const session = Sessions.get(conID);
    const container =
        session?.kind === 'playground' && session.refId != null
            ? (await PlaygroundService.Default().ContainerName(session.refId)) || undefined
            : undefined;
    return NewErrorTuple(
        {
            host: cfg.host || '127.0.0.1',
            port: Number(cfg.port) || 3306,
            user: cfg.username || '',
            password: cfg.password || '',
            database: cfg.database || '',
            serverVersion,
            isMariaDB: /mariadb/i.test(serverVersion),
            container,
        },
        null
    );
}

/** "root@127.0.0.1:55001/world" */
export const describeTarget = (t: MySQLTarget) => `${t.user}@${t.host}:${t.port}${t.database ? `/${t.database}` : ''}`;
