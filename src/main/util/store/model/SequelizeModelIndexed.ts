import { DataTypes } from 'sequelize';
import { SqlizeBaseModel } from './SequelizeModel';

/**
 * Model With a PK
 * @author Ahmad Baderkhan
 */
export class SqlizeModelIndexed extends SqlizeBaseModel {
    declare id: number;
    constructor(tableName?: string, schema?: any) {
        super(tableName, {
            ...schema,
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
        });
    }
}
