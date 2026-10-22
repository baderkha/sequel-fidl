import path from 'path';
import { v4 } from 'uuid';
import { GetPersistentDBConnection } from '../config';
import { PlaygroundConnection } from '../model/PlaygroundConnection';
import { PlaygroudConnectionsRepoSQLite } from '../repository/PlaygroundConnection';
import { BASE_APP_DATA_PATH } from '../util/application/path';
import { broadcast } from '../util/broadcast';
import { DEFAULT_GENERATED_DB_NAME, IDBProcess } from '../util/db_process';
import { MYSQLDocker } from '../util/db_process/MYSQL';
import { PostgresDocker } from '../util/db_process/Postgres';
import { DATABASES, DatabaseType, databaseType } from '../../shared/db/dialects';
import { DockerAPI } from '../util/docker/DockerRunnerImpl';
import { ContainerState } from '../util/docker/DockerRunner';
import { encryptSecret, decryptSecret } from '../util/secrets';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';
import { ConManager } from './Connections';
import { CreateConnection } from './db/ConnectionFactory';
import { SessionInfo, Sessions } from './Sessions';
import { fetchSample, getSample } from './samples';
import { ComparisonOperation } from '../util/store/repository';
const dockerNames = require('docker-names');

/** where playground data folders live , owned by the app */
export const PLAYGROUNDS_PATH = path.join(BASE_APP_DATA_PATH, 'playgrounds');

/** label on every container the app starts , value = playground id */
export const PLAYGROUND_LABEL = 'com.sequel-fidl.playground';

/** first boot of an emulated image (e.g. mysql 5.7 on apple silicon) is slow */
const BOOT_TIMEOUT_MS = 3 * 60 * 1000;

export const PLAYGROUND_PROGRESS_EV = 'playground_progress';
export const CONNECTION_CLOSED_EV = 'connection_closed';

export type PlaygroundInfo = {
    type: DatabaseType;
    id: number;
    name: string;
    version: string;
    port: number;
    state: ContainerState;
    connected: boolean;
    /** set while an operation (start , stop , delete) is running */
    busy: string;
    dataPath: string;
    /** database the playground opens on */
    database: string;
    /** sample database id ('' => empty playground) */
    sample: string;
    /** the sample has been imported */
    seeded: boolean;
    createdAt: string;
    lastUsedAt: string;
};

export type NewPlaygroundInput = {
    type?: DatabaseType;
    name: string;
    version: string;
    /** sample database to import on first start */
    sample?: string;
    port? : number
};

/**
 * Playgrounds : app managed database instances.
 * The data folder is the playground , the docker container is disposable and only exists
 * while the playground is in use. Stopping keeps the data , deleting removes it.
 * @author Ahmad Baderkhan
 */
export class PlaygroundService {
    private static _instance: PlaygroundService;
    private repo: PlaygroudConnectionsRepoSQLite;
    private processes: Map<DatabaseType, IDBProcess>;
    private conMgr: ConManager;
    /** playground id => what it's doing right now */
    private busy = new Map<number, string>();

    constructor(
        repo: PlaygroudConnectionsRepoSQLite,
        proc: IDBProcess | Map<DatabaseType, IDBProcess>,
        conMgr: ConManager
    ) {
        this.repo = repo;
        this.processes = proc instanceof Map ? proc : new Map([['mysql', proc]]);
        this.conMgr = conMgr;
    }

    static Default(): PlaygroundService {
        if (!PlaygroundService._instance) {
            PlaygroundService._instance = new PlaygroundService(
                new PlaygroudConnectionsRepoSQLite(
                    new PlaygroundConnection(),
                    GetPersistentDBConnection()
                ),
                new Map<DatabaseType, IDBProcess>([
                    ['mysql', new MYSQLDocker(DockerAPI.Default(), BASE_APP_DATA_PATH)],
                    ['postgres', new PostgresDocker(DockerAPI.Default(), BASE_APP_DATA_PATH)],
                ]),
                ConManager.GetInstance()
            );
        }
        return PlaygroundService._instance;
    }

    DockerAvailable(): Promise<boolean> {
        return this.processes.values().next().value.IsAvailable();
    }

    private process(type?: string): IDBProcess {
        const proc = this.processes.get(databaseType(type));
        if (!proc) throw new Error(`Unsupported database type: ${type}`);
        return proc;
    }

    private progress(id: number, message: string) {
        if (message) {
            this.busy.set(id, message);
        } else {
            this.busy.delete(id);
        }
        broadcast(PLAYGROUND_PROGRESS_EV, { id, message });
    }

    /** docker container of a playground , null when it doesn't exist */
    async ContainerName(id: number): Promise<string | null> {
        const pg = await this.row(id);
        return pg ? pg.containerName : null;
    }

    private async row(id: number): Promise<PlaygroundConnection | null> {
        const row: any = await this.repo.getDb().findByPk(id);
        return row ? (row.get({ plain: true }) as PlaygroundConnection) : null;
    }

    private async info(pg: PlaygroundConnection): Promise<PlaygroundInfo> {
        const state = await this.process(pg.type).State(pg.containerName);
        return {
            type: databaseType(pg.type),
            id: pg.id,
            name: pg.name,
            version: pg.version,
            port: pg.port,
            state,
            connected: Sessions.forRef('playground', pg.id).length > 0,
            busy: this.busy.get(pg.id) || '',
            dataPath: pg.sandboxFolderPath,
            database: pg.defaultDB,
            sample: pg.sample || '',
            seeded: !!pg.seeded,
            createdAt: pg.createdAt ? new Date(pg.createdAt).toISOString() : '',
            lastUsedAt: pg.lastUsedAt ? new Date(pg.lastUsedAt).toISOString() : '',
        };
    }

    async List(): Promise<PlaygroundInfo[]> {
        const rows = await this.repo.getDb().findAll({ order: [['createdAt', 'DESC']] });
        return Promise.all(
            rows.map((r) => this.info(r.get({ plain: true }) as PlaygroundConnection))
        );
    }

    generateRandomName(version: string) : string {
        return `${dockerNames.getRandomName().replaceAll("_","-")}-${version}`
    }

    /**
     * Register a new playground (nothing is started until it's opened)
     * @param input
     */
    async Create(input: NewPlaygroundInput): Promise<ErrorTuple<PlaygroundInfo>> {
        const key = v4();
        try {
            const type = databaseType(input.type);
            const engine = DATABASES[type];
            const sample = getSample(input.sample || '');
            if (sample && sample.type !== type) return NewErrorTuple(null, new Error('The sample belongs to a different database engine.'));
            if (input.port && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) return NewErrorTuple(null, new Error('Choose a port between 1 and 65535.'));
            if (input.port) {
                const existing = await this.repo.FindManyByCondition([{ col: 'port', op: ComparisonOperation.EQ, value: input.port }]);
                if (existing.length) return NewErrorTuple(null, new Error(`Port is already assigned to playground "${existing[0].name}".`));
            }
            const row: any = await this.repo.getDb().create({
                name: input.name.trim() || this.generateRandomName(input.version.trim()),
                type,
                version: input.version.trim() || 'latest',
                containerName: `sequel-fidl-pg-${key}`,
                sandboxFolderPath: path.join(PLAYGROUNDS_PATH, key),
                username: engine.username,
                password: encryptSecret(engine.username),
                port: input.port ? input.port : 0,
                defaultDB: DEFAULT_GENERATED_DB_NAME,
                sample: sample?.id || '',
                seeded: false,
            });


            return NewErrorTuple(
                await this.info(row.get({ plain: true }) as PlaygroundConnection),
                null
            );
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    async Rename(id: number, name: string): Promise<Error> {
        return this.repo
            .getDb()
            .update({ name }, { where: { id } })
            .then(() => null)
            .catch((err) => err);
    }

    /**
     * Start the playground (if needed) and connect to it
     * @param id
     */
    async Open(id: number): Promise<ErrorTuple<SessionInfo>> {
        if (this.busy.has(id)) {
            return NewErrorTuple(null, new Error(`Playground is busy: ${this.busy.get(id)}`));
        }
        const pg = await this.row(id);
        if (!pg) {
            return NewErrorTuple(null, new Error(`Playground ${id} not found`));
        }
        const type = databaseType(pg.type);
        const engine = DATABASES[type];
        const proc = this.process(type);
        try {
            let port = pg.port;
            if ((await this.process(pg.type).State(pg.containerName)) !== 'running') {
                if (!(await proc.IsAvailable())) {
                    return NewErrorTuple(
                        null,
                        new Error('Docker is not running. Start Docker Desktop and try again.')
                    );
                }
                this.progress(id, `Starting ${engine.label} ${pg.version}…`);
                const [out, err] = await proc.StartUpFromExisting(
                    pg.sandboxFolderPath,
                    pg.version,
                    pg.containerName,
                    pg.port,
                    {
                        labels: { [PLAYGROUND_LABEL]: `${id}` },
                        onProgress: (msg) => this.progress(id, msg),
                    }
                );
                if (err) {
                    return NewErrorTuple(null, err);
                }
                port = out.Port;
                await this.repo.getDb().update({ port }, { where: { id } });
            }

            this.progress(id, `Waiting for ${engine.label} to accept connections…`);
            const cfg = {
                host: '127.0.0.1',
                port,
                username: pg.username,
                password: decryptSecret(pg.password),
                database: pg.defaultDB,
            };
            let [con, err] = await CreateConnection(
                type,
                cfg,
                BOOT_TIMEOUT_MS,
                (elapsed) =>
                    this.progress(
                        id,
                        `Waiting for ${engine.label} to accept connections… ${Math.round(elapsed / 1000)}s`
                    )
            );
            if (err) {
                return NewErrorTuple(null, err);
            }

            // first start of a playground created with sample data
            const sample = getSample(pg.sample || '');
            if (sample && !pg.seeded) {
                this.progress(id, `Importing ${sample.name}…`);
                let importErr: Error | null = null;
                if (sample.sql) {
                    try {
                        await con.transaction((transaction) => con.query(sample.sql, { transaction }));
                    } catch (e) { importErr = e as Error; }
                } else {
                    const archive = await fetchSample(sample).catch((e: Error) => e);
                    if (archive instanceof Error) {
                        await con.close().catch(() => {});
                        return NewErrorTuple(null, new Error(`Couldn't download ${sample.name}: ${archive.message}`));
                    }
                    importErr = await proc.ImportArchive(pg.containerName, archive, sample.files, sample.database);
                }
                if (importErr) {
                    await con.close().catch(() => {});
                    return NewErrorTuple(
                        null,
                        new Error(`Importing ${sample.name} failed: ${importErr.message}`)
                    );
                }
                await this.repo
                    .getDb()
                    .update({ seeded: true, defaultDB: sample.database }, { where: { id } });
                // reopen on the sample database
                await con.close().catch(() => {});
                [con, err] = await CreateConnection(type, { ...cfg, database: sample.database }, 0);
                if (err) {
                    return NewErrorTuple(null, err);
                }
            }
            const conID = this.conMgr.Add(con);
            const session: SessionInfo = {
                conID,
                kind: 'playground',
                refId: id,
                label: pg.name,
            };
            Sessions.add(session);
            await this.repo.getDb().update({ lastUsedAt: new Date() }, { where: { id } });
            return NewErrorTuple(session, null);
        } finally {
            this.progress(id, '');
        }
    }

    /**
     * Close every connection to the playground and stop its container (data is kept)
     * @param id
     */
    async Stop(id: number): Promise<Error> {
        const pg = await this.row(id);
        if (!pg) {
            return new Error(`Playground ${id} not found`);
        }
        this.progress(id, 'Stopping…');
        try {
            for (const s of Sessions.forRef('playground', id)) {
                Sessions.remove(s.conID);
                await this.conMgr.Remove(s.conID, true);
                broadcast(CONNECTION_CLOSED_EV, { conID: s.conID, reason: 'Playground stopped' });
            }
            await this.process(pg.type).ShutDown(pg.containerName);
            return null;
        } finally {
            this.progress(id, '');
        }
    }

    /**
     * Stop the playground and delete its data
     * @param id
     */
    async Delete(id: number): Promise<Error> {
        const pg = await this.row(id);
        if (!pg) {
            return new Error(`Playground ${id} not found`);
        }
        const err = await this.Stop(id);
        if (err) {
            return err;
        }
        await this.process(pg.type).DeleteState(pg.sandboxFolderPath);
        return this.repo.DeleteByIndex({ id });
    }

    /**
     * Stop every playground that is running , used when the app quits
     */
    async StopAll(): Promise<void> {
        const all = await this.List().catch((): PlaygroundInfo[] => []);
        await Promise.all(
            all.filter((pg) => pg.state === 'running').map((pg) => this.Stop(pg.id))
        );
    }

    /**
     * A session ended , shut the playground down when nobody else uses it
     * @param session
     */
    async OnSessionClosed(session: SessionInfo): Promise<void> {
        if (session.kind !== 'playground' || session.refId === undefined) {
            return;
        }
        if (Sessions.forRef('playground', session.refId).length === 0) {
            await this.Stop(session.refId);
        }
    }
}
