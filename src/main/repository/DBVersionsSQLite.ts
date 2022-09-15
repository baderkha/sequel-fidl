import { DBVersions } from '../model/DBVersions';
import { BaseSQLRepository } from '../util/store/repository/sql';
import { IDbVersionsRepo } from './DBVersions';

export class DBVersionsSQLite
    extends BaseSQLRepository<DBVersions>
    implements IDbVersionsRepo {}
