import { DBVersions } from '../model/DBVersions';
import { Repository } from '../util/store/repository';

/**
 * Database Version Respository
 */
export interface IDbVersionsRepo extends Repository<DBVersions> {}
