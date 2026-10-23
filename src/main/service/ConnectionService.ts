import { Sequelize } from 'sequelize';
import { GetPersistentDBConnection } from '../config';
import { Connection } from '../model/Connections';
import { ConnectionsRepoSQLite } from '../repository/Connection';
import { decryptSecret, encryptSecret } from '../util/secrets';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';
import { ConManager } from './Connections';
import { ConnectionConfig, CreateConnection } from './db/ConnectionFactory';
import { SessionInfo, Sessions } from './Sessions';
import { DATABASES, databaseType, DatabaseType } from '../../shared/db/dialects';

/**
 * A saved connection as the renderer sees it , the password never leaves the main process
 */
export type SavedConnection = {
    type: DatabaseType;
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    database: string;
    hasPassword: boolean;
};


export type SSHConnection = {
    host: string;
    port: number | string;
    username: string;
    password?: string;
    privateKey?: Buffer;
}

export type ConnectionInput = {
    type?: DatabaseType;
    /** set when it's a saved connection */
    id?: number;
    name: string;
    host: string;
    port: number;
    username: string;
    /** undefined => keep the saved password */
    password?: string;
    database: string;
    ssh?: SSHConnection
};

const toSaved = (row: any): SavedConnection => ({
    type: databaseType(row.type),
    id: row.id,
    name: row.name,
    host: row.host,
    port: parseInt(row.port, 10) || DATABASES[databaseType(row.type)].port,
    username: row.username,
    database: row.db || '',
    hasPassword: !!row.password,
});

/**
 * Saved direct (non playground) connections
 * @author Ahmad Baderkhan
 */
export class ConnectionService {
    private static _instance: ConnectionService;
    private repo: ConnectionsRepoSQLite;
    private conMgr: ConManager;

    constructor(repo: ConnectionsRepoSQLite, conMgr: ConManager) {
        this.repo = repo;
        this.conMgr = conMgr;
    }

    static Default(): ConnectionService {
        if (!ConnectionService._instance) {
            ConnectionService._instance = new ConnectionService(
                new ConnectionsRepoSQLite(
                    new Connection(),
                    GetPersistentDBConnection()
                ),
                ConManager.GetInstance()
            );
        }
        return ConnectionService._instance;
    }

    async List(): Promise<SavedConnection[]> {
        const rows = await this.repo.getDb().findAll({ order: [['name', 'ASC']] });
        return rows.map((r) => toSaved(r.get({ plain: true })));
    }

    async Save(input: ConnectionInput): Promise<ErrorTuple<SavedConnection>> {
        const data: any = {
            name: input.name || `${input.username}@${input.host}`,
            host: input.host,
            port: `${input.port}`,
            username: input.username,
            db: input.database || '',
            type: databaseType(input.type),
        };
        if (input.password !== undefined) {
            data.password = encryptSecret(input.password);
        }
        try {
            if (input.id) {
                await this.repo.getDb().update(data, { where: { id: input.id } });
                const row = await this.repo.getDb().findByPk(input.id);
                return NewErrorTuple(toSaved(row.get({ plain: true })), null);
            }
            const row = await this.repo.getDb().create(data);
            return NewErrorTuple(toSaved(row.get({ plain: true })), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    async Delete(id: number): Promise<Error> {
        return this.repo.DeleteByIndex({ id });
    }

    /**
     * Fill in the saved password when the input didn't change it
     * @param input
     */
    private async resolve(input: ConnectionInput): Promise<ConnectionConfig> {
        let password = input.password;
        if (password === undefined && input.id) {
            const row: any = await this.repo.getDb().findByPk(input.id);
            password = row ? decryptSecret(row.password) : '';
        }
        return {
            host: input.host,
            port: input.port,
            username: input.username,
            password: password || '',
            database: input.database,
            ssh: input.ssh
        };
    }

    private async open(input: ConnectionInput): Promise<ErrorTuple<Sequelize>> {
        return CreateConnection(databaseType(input.type), await this.resolve(input), 0);
    }

    /**
     * Try the connection and return the server version
     * @param input
     */
    async Test(input: ConnectionInput): Promise<ErrorTuple<string>> {
        const [con, err] = await this.open(input);
        if (err) {
            return NewErrorTuple(null, err);
        }
        const version = await con.databaseVersion().catch(() => '');
        await con.close().catch(() => {});
        return NewErrorTuple(version, null);
    }

    async Connect(input: ConnectionInput): Promise<ErrorTuple<SessionInfo>> {
        const [con, err] = await this.open(input);
        if (err) {
            return NewErrorTuple(null, err);
        }
        const conID = this.conMgr.Add(con);
        const session: SessionInfo = {
            conID,
            kind: 'direct',
            refId: input.id,
            label: input.name || `${input.username}@${input.host}`,
        };
        Sessions.add(session);
        return NewErrorTuple(session, null);
    }
}
