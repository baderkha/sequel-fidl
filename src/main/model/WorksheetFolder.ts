import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';

/**
 * A folder in the worksheet explorer (nested through parentId , null = top level)
 */
export class WorksheetFolder extends SqlizeModelIndexed {
    declare scope: string;
    declare name: string;
    declare parentId: number | null;

    constructor() {
        super('worksheet_folders', {
            scope: {
                type: DataTypes.STRING,
            },
            name: {
                type: DataTypes.STRING,
            },
            parentId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        });
    }
}
