import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';
import { DBType } from './Connections';

export interface PlayGroundConnectionItems extends PlaygroundConnection {}

/**
 * Connection Config
 * @author Ahmad Baderkhan
 */
export class PlaygroundConnection extends SqlizeModelIndexed {
    declare type: DBType;
    declare version: string;
    declare sandboxFolderPath: string;
    declare username: string;
    declare password: string;
    declare port: number;
    declare defaultDB: string;

    constructor() {
        super('playground_connections', {
            type: {
                type: DataTypes.STRING,
            },
            version: {
                type: DataTypes.STRING,
            },
            sandboxFolderPath: {
                type: DataTypes.STRING,
            },
            username: {
                type: DataTypes.STRING,
            },
            password: {
                type: DataTypes.STRING,
            },
            port: {
                type: DataTypes.NUMBER,
            },
            defaultDB: {
                type: DataTypes.STRING(200),
            },
        });
    }

    toConnectionMap(): Map<string, string> {
        return new Map([
            ['user_name', this.username],
            ['password', this.password],
            ['host', '127.0.0.1'],
            ['port', this.port.toString()],
            ['default_db', this.defaultDB],
        ]);
    }
}
