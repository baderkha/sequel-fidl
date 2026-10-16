import { BaseSQLRepository } from '../util/store/repository/sql';
import { Connection } from '../model/Connections';
import { Repository } from '../util/store/repository';

export interface IConnectionRepo extends Repository<Connection> {}

export class ConnectionsRepoSQLite
    extends BaseSQLRepository<Connection>
    implements IConnectionRepo {}
