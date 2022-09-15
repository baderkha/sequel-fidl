import { NewTuple, Tuple } from '../util/tuple';
import { Sequelize } from 'sequelize';
import { v4 } from 'uuid';
import { pubsub } from '../util/pubsub';

export type ConFailEv = {
    connectionID: string;
};

export type ConnectionKilledEvent = ConFailEv;

/**
 * Global Cnnection manager for your db instances
 */
export class ConManager {
    /**
     * Map of the connection id => sequelize connection
     */
    private cons: Map<string, [NodeJS.Timer, Sequelize]> = new Map();
    static _cm: ConManager;
    static Second = 1 * 1000;
    static ConnectionFailureEvent = 'CON_MANAGER_CONNECTION_FAILURE';
    static ConnectionKilledEvent = 'CON_MANAGER_CONNECTION_KILLED';

    private constructor() {}

    public static GetInstance(): ConManager {
        if (!ConManager._cm) {
            ConManager._cm = new ConManager();
        }
        return ConManager._cm;
    }

    /**
     * Add a connection to a the manager
     *
     * This will also create an interval function that checks for connection aliveness
     *
     * Once you enroll the connection if it fails the test , then it will emit an event via the global pubsub package
     *
     * The event name is a constant in the class called `ConnectionFailureEvent`
     *
     * @param connectionId
     * @param dbLive
     * @param onFail on connection failure
     */
    Add(dbLive: Sequelize): string {
        const connectionId = v4();
        const timerId = global.setInterval(async () => {
            const isAlive = await dbLive
                .query('SELECT 1')
                .then(() => true)
                .catch(() => false);

            if (!isAlive) {
                const failEv: ConFailEv = {
                    connectionID: connectionId,
                };

                pubsub.emit(ConManager.ConnectionFailureEvent, failEv);
                this.Remove(connectionId); // once it has failed , remove the connection from the pool
            }
        }, 1 * ConManager.Second);

        this.cons.set(connectionId, [timerId, dbLive]);
        return connectionId;
    }

    /**
     * Remove a connection
     * @param connectionId
     * @param withKill , closes the conneciton as well
     * @returns
     */
    async Remove(connectionId: string, withKill = false): Promise<boolean> {
        const [timerId, con] = this.GetConById(connectionId);

        if (!con) {
            return Promise.resolve(true);
        }
        global.clearInterval(timerId);

        if (withKill) {
            await con.close().catch(() => {});
            const conKilledEv: ConnectionKilledEvent = {
                connectionID: connectionId,
            };
            pubsub.emit(ConManager.ConnectionKilledEvent, conKilledEv);
        }

        return Promise.resolve(this.cons.delete(connectionId));
    }

    /**
     * Removes all the active connections in the pool and kills them
     */
    async RemoveAllAndKill(ids?: Array<string>): Promise<void> {
        let promises: Array<Promise<boolean>> = [];

        if (ids.length && ids.length > 0) {
            promises = ids.map((id) => this.Remove(id, true));
        } else {
            this.cons.forEach((_, key) => {
                const prom = this.Remove(key, true);
                promises.push(prom);
            });
        }

        await Promise.all(promises);
    }

    GetConById(id: string): Tuple<NodeJS.Timer, Sequelize> {
        let res = this.cons.get(id);
        if (res) {
            return NewTuple(res[0], res[1]);
        }
        return NewTuple(null, null);
    }
}
