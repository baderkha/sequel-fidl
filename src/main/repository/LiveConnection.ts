import { LiveConnection, LiveConnectionType } from '../model/LiveConnection';
import { Repository } from '../util/store/repository';

export interface ILiveConnectionRepo extends Repository<LiveConnection> {
    /**
     * Find all live connections by the type , normal connection vs playground
     * @param type
     */
    FindAllByType(type: LiveConnectionType): Promise<Array<LiveConnection>>;
}
