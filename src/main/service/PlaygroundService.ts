import path from 'path';
import { v4 } from 'uuid';
import { GetPersistentDBConnection } from '../config';
import { PlaygroundConnection } from '../model/PlaygroundConnection';
import { PlaygroudConnectionsRepoSQLite } from '../repository/PlaygroundConnection';
import { BASE_APP_DATA_PATH } from '../util/application/path';
import { broadcast } from '../util/broadcast';
import { DEFAULT_GENERATED_DB_NAME, IDBProcess } from '../util/db_process';
import { MYSQLDocker } from '../util/db_process/MYSQL';
import { DockerAPI } from '../util/docker/DockerRunnerImpl';
import { ContainerState } from '../util/docker/DockerRunner';
import { encryptSecret, decryptSecret } from '../util/secrets';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';
import { ConManager } from './Connections';
import { CreateConnection } from './db/ConnectionFactory';
import { SessionInfo, Sessions } from './Sessions';
import { fetchSample, getSample } from './samples';
import { ComparisonOperation } from '../util/store/repository';

/** where playground data folders live , owned by the app */
export const PLAYGROUNDS_PATH = path.join(BASE_APP_DATA_PATH, 'playgrounds');

/** label on every container the app starts , value = playground id */
export const PLAYGROUND_LABEL = 'com.sequel-fidl.playground';

/** first boot of an emulated image (e.g. mysql 5.7 on apple silicon) is slow */
const BOOT_TIMEOUT_MS = 3 * 60 * 1000;

export const PLAYGROUND_PROGRESS_EV = 'playground_progress';
export const CONNECTION_CLOSED_EV = 'connection_closed';

export type PlaygroundInfo = {
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
    name: string;
    version: string;
    /** sample database to import on first start */
    sample?: string;
    port? : number
};

/**
 * Playgrounds : app managed mysql instances.
 * The data folder is the playground , the docker container is disposable and only exists
 * while the playground is in use. Stopping keeps the data , deleting removes it.
 * @author Ahmad Baderkhan
 */
export class PlaygroundService {
    private static _instance: PlaygroundService;
    private repo: PlaygroudConnectionsRepoSQLite;
    private proc: IDBProcess;
    private conMgr: ConManager;
    /** playground id => what it's doing right now */
    private busy = new Map<number, string>();

    constructor(
        repo: PlaygroudConnectionsRepoSQLite,
        proc: IDBProcess,
        conMgr: ConManager
    ) {
        this.repo = repo;
        this.proc = proc;
        this.conMgr = conMgr;
    }

    static Default(): PlaygroundService {
        if (!PlaygroundService._instance) {
            PlaygroundService._instance = new PlaygroundService(
                new PlaygroudConnectionsRepoSQLite(
                    new PlaygroundConnection(),
                    GetPersistentDBConnection()
                ),
                new MYSQLDocker(DockerAPI.Default(), BASE_APP_DATA_PATH),
                ConManager.GetInstance()
            );
        }
        return PlaygroundService._instance;
    }

    DockerAvailable(): Promise<boolean> {
        return this.proc.IsAvailable();
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
        const state = await this.proc.State(pg.containerName);
        return {
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

    /**
     * Register a new playground (nothing is started until it's opened)
     * @param input
     */
    async Create(input: NewPlaygroundInput): Promise<ErrorTuple<PlaygroundInfo>> {
        const key = v4();
        try {
            let res = await this.repo.FindAll();
            console.log(res.length ? res[0] : null)
            const val = await this.repo.FindManyByCondition([{
                col : "port",
                op : ComparisonOperation.EQ,
                value : input.port
            }])
            if (val.length > 0) {
                return NewErrorTuple(null,new Error(`This port is already taken by Playground:"${val[0].name}"`,));
            }
            const row: any = await this.repo.getDb().create({
                name: input.name.trim() || `MySQL ${input.version}`,
                type: 'mysql',
                version: input.version.trim() || 'latest',
                containerName: `sequel-fidl-pg-${key}`,
                sandboxFolderPath: path.join(PLAYGROUNDS_PATH, key),
                username: 'root',
                password: encryptSecret('root'),
                port: input.port ? input.port : 0,
                defaultDB: DEFAULT_GENERATED_DB_NAME,
                sample: getSample(input.sample || '') ? input.sample : '',
                seeded: false,
            });

            console.log(row)

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
        try {
            let port = pg.port;
            if ((await this.proc.State(pg.containerName)) !== 'running') {
                if (!(await this.proc.IsAvailable())) {
                    return NewErrorTuple(
                        null,
                        new Error('Docker is not running. Start Docker Desktop and try again.')
                    );
                }
                this.progress(id, `Starting MySQL ${pg.version}…`);
                const [out, err] = await this.proc.StartUpFromExisting(
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

            this.progress(id, 'Waiting for MySQL to accept connections…');
            const cfg = {
                host: '127.0.0.1',
                port,
                username: pg.username,
                password: decryptSecret(pg.password),
                database: pg.defaultDB,
            };
            let [con, err] = await CreateConnection(
                'mysql',
                cfg,
                BOOT_TIMEOUT_MS,
                (elapsed) =>
                    this.progress(
                        id,
                        `Waiting for MySQL to accept connections… ${Math.round(elapsed / 1000)}s`
                    )
            );
            if (err) {
                return NewErrorTuple(null, err);
            }

            // first start of a playground created with sample data
            const sample = getSample(pg.sample || '');
            if (sample && !pg.seeded) {
                this.progress(id, `Downloading the ${sample.name} sample…`);
                const archive = await fetchSample(sample).catch((e: Error) => e);
                if (archive instanceof Error) {
                    await con.close().catch(() => {});
                    return NewErrorTuple(
                        null,
                        new Error(`Couldn't download the ${sample.name} sample: ${archive.message}`)
                    );
                }
                this.progress(id, `Importing ${sample.name}…`);
                const importErr = await this.proc.ImportArchive(
                    pg.containerName,
                    archive,
                    sample.files,
                    sample.database
                );
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
                [con, err] = await CreateConnection('mysql', { ...cfg, database: sample.database }, 0);
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
            await this.proc.ShutDown(pg.containerName);
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
        await this.proc.DeleteState(pg.sandboxFolderPath);
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
