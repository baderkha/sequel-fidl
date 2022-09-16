import { ErrorTuple, NewErrorTuple } from '../util/tuple';
import { DBType } from '../model/Connections';
import { PlaygroundConnection } from '../model/PlaygroundConnection';
import {
    IPlaygroundConnectionRepo,
    PlaygroudConnectionsRepoSQLite,
} from '../repository/PlaygroundConnection';
import { CreateConnection } from './db/ConnectionFactory';
import { ConManager } from './Connections';
import { PlayGroundManger } from './db/PlaygroundManager';
import { DBInitService } from './DbService';
import { Make } from '../util/object';
import { LiveConnection } from '../model/LiveConnection';
import { ILiveConnectionRepo } from '../repository/LiveConnection';
import { GetMemDBSqlConnection, GetPersistentDBConnection } from '../config';
import { LiveConnectionSQLiteRepo } from '../repository/LiveConnectionSQLite';

export type PGroundOptions = {
    DB: DBType;
    Version: string;
};

export type NewPlayground = {
    pground: PlaygroundConnection;
    procId: string;
};

/**
 * Mapping of database type => versions
 */
export type DatabaseSupported = Map<DBType, Array<string>>;

/**
 * Runs DB related operations and manages state for them
 * @author Ahmad Baderkhan
 * @version 1
 */
export class PlaygroundService extends DBInitService {
    private pgroundMgr: PlayGroundManger;
    private repo: IPlaygroundConnectionRepo;
    private static _instance: PlaygroundService;

    constructor(
        mgr: ConManager,
        liveConRepo: ILiveConnectionRepo,
        repo: IPlaygroundConnectionRepo,
        pgroundMgr: PlayGroundManger
    ) {
        super(mgr, liveConRepo);
        this.pgroundMgr = pgroundMgr;
        this.repo = repo;
    }

    public static Default(): PlaygroundService {
        if (!PlaygroundService._instance) {
            const db = GetPersistentDBConnection();
            const dbMem = GetMemDBSqlConnection();
            const liveConRepo = new LiveConnectionSQLiteRepo(
                new LiveConnection(),
                dbMem
            );
            const playGroundRepo = new PlaygroudConnectionsRepoSQLite(
                new PlaygroundConnection(),
                db
            );
            PlaygroundService._instance = new PlaygroundService(
                ConManager.GetInstance(),
                liveConRepo,
                playGroundRepo,
                PlayGroundManger.Default()
            );
        }
        return PlaygroundService._instance;
    }

    async newPlayground(
        type: DBType,
        version: string
    ): Promise<ErrorTuple<NewPlayground>> {
        let [out, err] = await this.pgroundMgr.newPground(type, version);
        if (err != null) {
            return NewErrorTuple(null, err);
        }

        let con = Make(PlaygroundConnection, {
            type,
            version,
            sandboxFolderPath: out.DBDatapath,
            username: out.UserName,
            password: out.Password,
            port: out.Port,
            defaultDB: out.DefaultGeneratedDatabase,
        });

        err = await this.repo.Create(con);
        if (err != null) {
            return NewErrorTuple(null, err);
        }

        return NewErrorTuple(
            {
                pground: con,
                procId: out.ProcessID,
            },
            null
        );
    }

    public async connectToLivePlayground(
        pground: PlaygroundConnection,
        processId: string
    ): Promise<ErrorTuple<string>> {
        let [con, err] = await CreateConnection(
            pground.type,
            pground.toConnectionMap()
        );
        if (err != null) {
            return NewErrorTuple(null, err);
        }
        let conId = this.conmgr.Add(con);
        const liveCon = Make(LiveConnection, {
            liveConId: conId,
            connectionType: 'Playground',
            processId: processId,
            connectionConfigId: pground.id,
        });

        err = await this.liveConRepo.Create(liveCon);
        if (err != null) {
            return NewErrorTuple(null, err);
        }
        return NewErrorTuple(conId, null);
    }

    async stopPlayground(conId: string): Promise<ErrorTuple<boolean>> {
        const [con, isFound] = await this.liveConRepo.FindByIndex({
            liveConId: conId,
        });

        if (!isFound || con.connectionType != 'Playground') {
            return NewErrorTuple(
                false,
                new Error(
                    `Could not find ${conId} connection to stop the playground`
                )
            );
        }

        const dbType = await this.repo
            .FindByIndex({
                id: con.connectionConfigId,
            })
            .then(([pg, isFound]) => {
                if (isFound) {
                    return pg.type;
                }
                return null;
            });

        if (dbType) {
            this.pgroundMgr.killPground(dbType, con.processId);
        }

        await this.conmgr.Remove(conId, true);

        return NewErrorTuple(true, null);
    }

    async killAllPlaygrounds(): Promise<void> {
        const res = await this.liveConRepo.FindAllByType('Playground');
        if (res.length && res.length > 0) {
            let promises: Array<Promise<ErrorTuple<boolean>>> = [];
            res.forEach((liveCon) => {
                const prom = this.stopPlayground(liveCon.liveConId);
                promises.push(prom);
            });
            await Promise.all(promises);
        }
    }

    async deletePlayground(pgroundId: number): Promise<ErrorTuple<boolean>> {
        const [res, isFound] = await this.repo.FindByIndex({
            id: pgroundId,
        });

        if (!isFound) {
            return NewErrorTuple(
                false,
                new Error(`could not find ${pgroundId} playground id`)
            );
        }

        await this.pgroundMgr.deletePlaygroundState(
            res.type,
            res.sandboxFolderPath
        );

        await this.repo.DeleteByIndex({
            id: pgroundId,
        });

        return NewErrorTuple(true, null);
    }
}
