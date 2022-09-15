import { SqlizeBaseModel } from '../util/store/model/SequelizeModel';
import { DataTypes } from 'sequelize';
import { DBType } from './Connections';

/**
 * Database Versions
 * Returns back the versions supported for each database
 */
export class DBVersions extends SqlizeBaseModel {
    declare name: DBType;
    declare version: string;
    constructor() {
        super('db_versions', {
            name: {
                type: DataTypes.STRING(100),
                primaryKey: true,
            },
            version: {
                type: DataTypes.STRING(100),
                primaryKey: true,
            },
        });
    }
}
