import { ipcMain } from 'electron';
import { GetMemDBSqlConnection, GetPersistentDBConnection } from '../../config';
import { Connection } from '../../model/Connections';
import { LiveConnection } from '../../model/LiveConnection';
import { PlaygroundConnection } from '../../model/PlaygroundConnection';
import { migrate } from '../../util/store/model';
import { PlaygroundInitService } from '../../service/PlaygroundInitService';
import { SQLService } from '../../service/SQLService';
import { DummyPlaygroundProviderEventController } from './DummyPlaygroundProviderEventController';
import { PlaygroundEventController } from './PlaygroundEventController';
import { SQLEventController } from './SQLEventController';
import { DBVersions } from '../../model/DBVersions';

export const InitEventListeners = async (): Promise<void> => {
    {
        await migrate(PlaygroundConnection, GetPersistentDBConnection());
        await migrate(Connection, GetPersistentDBConnection());
        await migrate(LiveConnection, GetMemDBSqlConnection());
        await migrate(DBVersions, GetPersistentDBConnection());
    }

    PlaygroundEventController(ipcMain, PlaygroundInitService.Default());
    SQLEventController(ipcMain, SQLService.Default());
    DummyPlaygroundProviderEventController(
        ipcMain,
        PlaygroundInitService.Default(),
        SQLService.Default()
    );
};
