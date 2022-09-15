import { LiveConnection, LiveConnectionType } from '../model/LiveConnection';
import { BaseSQLRepository } from '../util/store/repository/sql';
import { ILiveConnectionRepo } from './LiveConnection';

export class LiveConnectionSQLiteRepo
    extends BaseSQLRepository<LiveConnection>
    implements ILiveConnectionRepo
{
    async FindAllByType(type: LiveConnectionType): Promise<LiveConnection[]> {
        return await this.getDb()
            .findAll({
                where: {
                    connectionType: type,
                },
            })
            .then((data) => data as unknown as Array<LiveConnection>)
            .catch(() => [] as Array<LiveConnection>);
    }
}
