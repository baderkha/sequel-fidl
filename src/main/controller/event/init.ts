import { ipcMain } from 'electron';
import { GetPersistentDBConnection } from '../../config';
import { Connection } from '../../model/Connections';
import { PlaygroundConnection } from '../../model/PlaygroundConnection';
import { migrate } from '../../util/store/model';
import { SQLService } from '../../service/SQLService';
import { ConnectionService } from '../../service/ConnectionService';
import { ConFailEv, ConManager } from '../../service/Connections';
import { PlaygroundService } from '../../service/PlaygroundService';
import { Sessions } from '../../service/Sessions';
import { Transactions } from '../../service/Transactions';
import { broadcast } from '../../util/broadcast';
import { ConnectionEventController } from './ConnectionEventController';
import { PlaygroundEventController } from './PlaygroundEventController';
import { SQLEventController } from './SQLEventController';
import { DBVersions } from '../../model/DBVersions';
import { Worksheet } from '../../model/Worksheet';
import { WorksheetFolder } from '../../model/WorksheetFolder';
import { WorksheetService } from '../../service/WorksheetService';
import { WorksheetEventController } from './WorksheetEventController';
import { WorkspaceFolder } from '../../model/WorkspaceFolder';
import { WorkspaceService } from '../../service/WorkspaceService';
import { TerminalService } from '../../service/terminal/TerminalService';
import { WorkspaceEventController } from './WorkspaceEventController';
import { ExportEventController } from './ExportEventController';
import { ExportService } from '../../service/export/ExportService';

export const CONNECTION_LOST_EV = 'connection_lost';

export const InitEventListeners = async (
    cboard: Electron.Clipboard
): Promise<void> => {
    {
        await migrate(PlaygroundConnection, GetPersistentDBConnection());
        await migrate(Connection, GetPersistentDBConnection());
        await migrate(DBVersions, GetPersistentDBConnection());
        await migrate(Worksheet, GetPersistentDBConnection());
        await migrate(WorksheetFolder, GetPersistentDBConnection());
        await migrate(WorkspaceFolder, GetPersistentDBConnection());
    }

    const playgrounds = PlaygroundService.Default();
    PlaygroundEventController(ipcMain, playgrounds);
    ConnectionEventController(
        ipcMain,
        ConnectionService.Default(),
        playgrounds,
        ConManager.GetInstance()
    );
    SQLEventController(cboard, ipcMain, SQLService.Default());
    WorksheetEventController(ipcMain, WorksheetService.Default());
    WorkspaceEventController(ipcMain, WorkspaceService.Default(), TerminalService.Default());
    ExportEventController(ipcMain, ExportService.Default());

    // the health check dropped a connection , tell the renderer
    // emitted internally with ipcMain.emit(name , payload) , so the payload is the first arg
    ipcMain.on(ConManager.ConnectionFailureEvent, (payload: unknown) => {
        const ev = payload as ConFailEv;
        Transactions.drop(ev.connectionID, 'The connection was lost , the transaction was rolled back');
        Sessions.remove(ev.connectionID);
        broadcast(CONNECTION_LOST_EV, { conID: ev.connectionID });
    });
};
