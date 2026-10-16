import { ErrorTuple } from '../../util/tuple';
import { Dialect, Sequelize } from 'sequelize';
import { DBType } from '../../model/Connections';

const CONNECTION_TRY_BEFORE_TIMEOUT_MS = 60 * 1000;
const RETRY_EVERY_MS = 1000;

export type ConnectionConfig = {
    host: string;
    port: number;
    username: string;
    password: string;
    /** empty => no default database */
    database?: string;
};

/**
 * Poll the connection until it answers or the timeout passes
 * @param con
 * @param timeoutMs 0 => a single attempt
 * @param onRetry called before every retry
 */
export const waitTillConnection = async (
    con: Sequelize,
    timeoutMs = CONNECTION_TRY_BEFORE_TIMEOUT_MS,
    onRetry?: (elapsedMs: number) => void
): Promise<Error> => {
    const started = Date.now();
    for (;;) {
        try {
            await con.query('select 1');
            return null;
        } catch (err) {
            const elapsed = Date.now() - started;
            if (elapsed >= timeoutMs) {
                return timeoutMs > 0
                    ? new Error(
                          `Timed out after ${Math.round(elapsed / 1000)}s: ${
                              (err as Error).message
                          }`
                      )
                    : (err as Error);
            }
            onRetry && onRetry(elapsed);
            await new Promise((r) => setTimeout(r, RETRY_EVERY_MS));
        }
    }
};

/**
 * Async Create a connection after making
 * sure it's actually ready to process sql commands
 * @param type
 * @param cfg
 * @param timeoutMs how long to keep retrying (playgrounds need time to boot) , 0 => fail fast
 * @param onRetry
 */
export const CreateConnection = async (
    type: DBType,
    cfg: ConnectionConfig,
    timeoutMs = CONNECTION_TRY_BEFORE_TIMEOUT_MS,
    onRetry?: (elapsedMs: number) => void
): Promise<ErrorTuple<Sequelize>> => {
    if (type !== 'mysql') {
        return [null, new Error('Unsupported Database Type')];
    }
    const con = new Sequelize(cfg.database || '', cfg.username, cfg.password, {
        host: cfg.host || '127.0.0.1',
        port: cfg.port,
        dialect: type as Dialect,
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 },
        dialectOptions: {
            multipleStatements: true,
            connectTimeout: 10000,
            // keep DECIMAL / BIGINT precision
            supportBigNumbers: true,
            dateStrings: false,
        },
    });
    const err = await waitTillConnection(con, timeoutMs, onRetry);
    if (err) {
        await con.close().catch(() => {});
        return [null, err];
    }
    return [con, null];
};
