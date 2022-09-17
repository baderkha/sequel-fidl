import { LiveConnection } from '../model/LiveConnection';
import { ILiveConnectionRepo } from '../repository/LiveConnection';
import { ConManager } from './Connections';

export abstract class DBInitService {
    protected conmgr: ConManager;
    protected liveConRepo: ILiveConnectionRepo;
    constructor(conmgr: ConManager, repo: ILiveConnectionRepo) {
        this.conmgr = conmgr;
        this.liveConRepo = repo;
    }

    public async GetAllLiveConnections(): Promise<LiveConnection[]> {
        return await this.liveConRepo.FindAll();
    }
}
