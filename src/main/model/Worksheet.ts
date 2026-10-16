import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';

/**
 * A saved SQL worksheet
 */
export class Worksheet extends SqlizeModelIndexed {
    /** which connection it belongs to , e.g. "playground:3" / "direct:5" */
    declare scope: string;
    declare name: string;
    declare sql: string;
    /** containing folder , null = top level */
    declare folderId: number | null;

    constructor() {
        super('worksheets', {
            scope: {
                type: DataTypes.STRING,
            },
            name: {
                type: DataTypes.STRING,
            },
            sql: {
                type: DataTypes.TEXT,
                defaultValue: '',
            },
            folderId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        });
    }
}
