import { Sequelize } from 'sequelize';
import { SqlizeBaseModel } from './SequelizeModel';

/**
 * Base Model that provides the repository with specific information for the store
 */
export interface IBaseModel {
    TableName(): string;
    PrimaryKeys(): string[];
    ClassName(): string;
}

export const migrate = async (
    clase: typeof SqlizeBaseModel,
    con: Sequelize
) => {
    const mdl = new clase();
    const schema = mdl.GetSchema();
    await con
        .define(clase.name, schema[0], { ...schema[1], sequelize: con })
        .sync();
};
