import { DataTypes } from 'sequelize';
import { SqlizeModelIndexed } from '../util/store/model/SequelizeModelIndexed';

/**
 * The folder on disk a connection keeps its SQL files in
 */
export class WorkspaceFolder extends SqlizeModelIndexed {
    declare scope: string;
    declare path: string;

    constructor() {
        super('workspace_folders', {
            scope: {
                type: DataTypes.STRING,
            },
            path: {
                type: DataTypes.STRING(1024),
            },
        });
    }
}
