import { ipcMain, IpcMain } from 'electron';
import { PlaygroundInitService } from '../../service/PlaygroundInitService';
import { SQLService } from '../../service/SQLService';
let conIDMain: string = '';
export const DummyPlaygroundProviderEventController = (
    e: IpcMain,
    pser: PlaygroundInitService,
    sqlser: SQLService
) => {
    e.handle('init_dummy_playground', async () => {
        if (!conIDMain) {
            const [res] = await pser.newPlayground('mysql', '5.7');
            const [conID] = await pser.connectToLivePlayground(
                res.pground,
                res.procId
            );
            await sqlser.CreateTable(conID, 'users', [
                {
                    FieldName: 'id',
                    IsPrimaryKey: true,
                    NullAllowed: false,
                    Type: 'int(11)',
                    Default: 'AUTO_INCREMENT',
                },
                {
                    FieldName: 'first_name',
                    IsPrimaryKey: false,
                    NullAllowed: true,
                    Type: 'varchar(255)',
                    Default: '',
                },
                {
                    FieldName: 'last_name',
                    IsPrimaryKey: false,
                    NullAllowed: true,
                    Type: 'varchar(255)',
                    Default: '',
                },
                {
                    FieldName: 'birth_date',
                    IsPrimaryKey: false,
                    NullAllowed: true,
                    Type: 'DATETIME',
                    Default: '',
                },
            ]);
            conIDMain = conID;
        }
        return conIDMain;
    });
};
