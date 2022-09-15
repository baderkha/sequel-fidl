import { SqlizeBaseModel } from '../util/store/model/SequelizeModel';
import { DataTypes } from 'sequelize';

export type LiveConnectionType = 'Playground' | 'Connection';

export class LiveConnection extends SqlizeBaseModel {
    declare liveConId: string;
    declare connectionType: LiveConnectionType;
    declare processId: string;
    declare connectionConfigId: number;
    constructor() {
        super('live_connections', {
            liveConId: {
                type: DataTypes.STRING(50),
                primaryKey: true,
            },
            connectionType: {
                type: DataTypes.STRING(20),
            },
            processId: {
                type: DataTypes.STRING(50),
            },
            connectionConfigId: {
                type: DataTypes.STRING(50),
            },
        });
    }
}
