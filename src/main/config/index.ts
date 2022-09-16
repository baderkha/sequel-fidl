import { Sequelize } from "sequelize";

let con : Sequelize;

export const GetDBConnection = () : Sequelize => {
    if (!con) {
        con = new Sequelize('sqlite::memory')
    }
    return con;
}