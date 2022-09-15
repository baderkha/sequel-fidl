import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';

export type DBType = 'MYSQL' | 'SQLite' | 'Postgres' | 'MariaDB';

/**
 * Connection Config
 * @author Ahmad Baderkhan
 */
export class Connection extends SqlizeModelIndexed {
    declare username: string;
    declare password: string;
    declare host: string;
    declare port: string;
    declare db: string;
    declare type: DBType;
    constructor() {
        super('connections', {
            username: {
                type: DataTypes.STRING,
            },
            password: {
                type: DataTypes.STRING,
            },
            host: {
                type: DataTypes.STRING,
            },
            port: {
                type: DataTypes.STRING,
            },
            db: {
                type: DataTypes.STRING,
            },
            type: {
                type: DataTypes.STRING,
            },
        });
    }
}
