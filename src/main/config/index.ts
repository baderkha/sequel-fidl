import { mkdirSync } from 'fs';
import path from 'path';
import { Sequelize } from 'sequelize';
import { BASE_APP_DATA_PATH } from '../util/application/path';

let con: Sequelize;
let memCon: Sequelize;

/**
 * Where the app keeps its own state (saved connections , playgrounds)
 */
export const APP_DB_PATH = path.join(BASE_APP_DATA_PATH, 'sequel-fidl.sqlite');

export const GetPersistentDBConnection = (): Sequelize => {
    if (!con) {
        mkdirSync(BASE_APP_DATA_PATH, { recursive: true });
        con = new Sequelize({
            dialect: 'sqlite',
            storage: APP_DB_PATH,
            logging: false,
        });
    }
    return con;
};

export const GetMemDBSqlConnection = (): Sequelize => {
    if (!memCon) {
        memCon = new Sequelize('sqlite::memory', { logging: false });
    }
    return memCon;
};
