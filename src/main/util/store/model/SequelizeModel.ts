import { NewTuple, Tuple } from '../../tuple';
import { DataTypes } from 'sequelize';
import { IBaseModel } from '.';

/**
 * Base Model models can extend along with the Base Model methods you should implement
 * @author Ahmad Baderkhan
 */
export class SqlizeBaseModel implements IBaseModel {
    declare createdAt: Date;
    declare updatedAt: Date;

    TableName: () => string;
    GetSchema: () => Tuple<any, any>;

    PrimaryKeys: () => string[];

    ClassName(): string {
        return this.constructor.name;
    }

    constructor(tableName?: string, schema?: any) {
        let pks: Array<string> = [];
        for (let k in schema) {
            if (schema[k]['primaryKey']) {
                pks.push(k);
            }
        }
        this.TableName = (): string => {
            return tableName;
        };
        this.GetSchema = (): Tuple<any, any> =>
            NewTuple(
                {
                    ...schema,
                    createdAt: {
                        type: DataTypes.DATE,
                        defaultValue: DataTypes.NOW,
                    },
                    updatedAt: {
                        type: DataTypes.DATE,
                        defaultValue: DataTypes.NOW,
                    },
                },
                {
                    tableName,
                }
            );
        this.PrimaryKeys = (): string[] => {
            return pks;
        };
    }
}
