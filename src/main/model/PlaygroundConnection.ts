import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';
import { DBType } from './Connections';

export interface PlayGroundConnectionItems extends PlaygroundConnection {}

/**
 * Connection Config
 * @author Ahmad Baderkhan
 */
export class PlaygroundConnection extends SqlizeModelIndexed {
    declare name: string;
    /** docker container name , the container itself is disposable */
    declare containerName: string;
    declare lastUsedAt: Date;
    /** sample database to import on first start ('' => none) */
    declare sample: string;
    /** the sample was imported */
    declare seeded: boolean;
    declare type: DBType;
    declare version: string;
    declare sandboxFolderPath: string;
    declare username: string;
    declare password: string;
    declare port: number;
    declare defaultDB: string;

    constructor() {
        super('playground_connections', {
            name: {
                type: DataTypes.STRING,
            },
            containerName: {
                type: DataTypes.STRING,
            },
            lastUsedAt: {
                type: DataTypes.DATE,
            },
            sample: {
                type: DataTypes.STRING,
                defaultValue: '',
            },
            seeded: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
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
