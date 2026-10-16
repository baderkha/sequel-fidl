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
    const model = con.define(clase.name, schema[0], {
        ...schema[1],
        sequelize: con,
    });
    await model.sync();

    // sync() never alters an existing table , add the columns new versions of the model introduced
    const qi = con.getQueryInterface();
    const existing = await qi.describeTable(model.getTableName());
    for (const [col, def] of Object.entries(schema[0] as Record<string, any>)) {
        if (!existing[col] && !def.primaryKey) {
            await qi.addColumn(model.getTableName(), col, {
                ...def,
                allowNull: true,
            });
        }
    }
};
