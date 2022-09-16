import { Sequelize } from 'sequelize';

let con: Sequelize;
let memCon: Sequelize;

export const GetPersistentDBConnection = (): Sequelize => {
    if (!con) {
        con = new Sequelize('sqlite::memory');
    }
    return con;
};

export const GetMemDBSqlConnection = (): Sequelize => {
    if (!memCon) {
        memCon = new Sequelize('sqlite::memory');
    }
    return memCon;
};
