import { BaseSQLRepository } from '../util/store/repository/sql';
import { PlaygroundConnection } from '../model/PlaygroundConnection';
import { Repository } from '../util/store/repository';

export interface IPlaygroundConnectionRepo
    extends Repository<PlaygroundConnection> {}

export class PlaygroudConnectionsRepoSQLite
    extends BaseSQLRepository<PlaygroundConnection>
    implements IPlaygroundConnectionRepo {}
