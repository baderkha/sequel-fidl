import { ErrorTuple, NewTuple } from '../util/tuple';
import { LiveConnection } from '../model/LiveConnection';
import { ILiveConnectionRepo } from '../repository/LiveConnection';
import { ConManager } from './Connections';

export abstract class DBService {
    protected conmgr: ConManager;
    protected liveConRepo: ILiveConnectionRepo;
    constructor(conmgr: ConManager, repo: ILiveConnectionRepo) {
        this.conmgr = conmgr;
        this.liveConRepo = repo;
    }

    public async GetAllLiveConnections(): Promise<LiveConnection[]> {
        return await this.liveConRepo.FindAll();
    }

    public async RunSQL(
        liveConId: string,
        sqlQuery: string
    ): Promise<ErrorTuple<any>> {
        const [_, con] = this.conmgr.GetConById(liveConId);
        return con
            .query(sqlQuery, {
                raw: true,
                mapToModel: false,

                benchmark: true,
            })
            .then((data) => NewTuple(data, null))
            .catch((err) => NewTuple(null, err));
    }
}
