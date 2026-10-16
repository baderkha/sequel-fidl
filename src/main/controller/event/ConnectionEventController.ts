import { IpcMain } from 'electron';
import { ConnectionInput, ConnectionService } from '../../service/ConnectionService';
import { ConManager } from '../../service/Connections';
import { PlaygroundService } from '../../service/PlaygroundService';
import { Sessions } from '../../service/Sessions';
import { Event } from '../../util/event';

export class ConnectionInputEvent extends Event<ConnectionInput> {}
export class ConnectionIdEvent extends Event<{ id: number }> {}
export class DisconnectEvent extends Event<{ conID: string }> {}

/**
 * Saved direct connections + closing any live connection
 */
export const ConnectionEventController = (
    e: IpcMain,
    ser: ConnectionService,
    playgrounds: PlaygroundService,
    conMgr: ConManager
) => {
    e.handle('list_connections', () => ser.List());
    e.handle('save_connection', (_, arg: ConnectionInputEvent) => ser.Save(arg.Data));
    e.handle('delete_connection', (_, arg: ConnectionIdEvent) => ser.Delete(arg.Data.id));
    e.handle('test_connection', (_, arg: ConnectionInputEvent) => ser.Test(arg.Data));
    e.handle('connect', (_, arg: ConnectionInputEvent) => ser.Connect(arg.Data));

    e.handle('disconnect', async (_, arg: DisconnectEvent) => {
        const session = Sessions.get(arg.Data.conID);
        Sessions.remove(arg.Data.conID);
        await conMgr.Remove(arg.Data.conID, true);
        if (session) {
            await playgrounds.OnSessionClosed(session);
        }
        return { stoppedPlayground: session?.kind === 'playground' };
    });
};
