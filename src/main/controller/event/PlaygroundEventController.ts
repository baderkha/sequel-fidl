import { PlaygroundInitService } from 'main/service/PlaygroundInitService';
import { Event } from 'main/util/event';
import { DBType } from 'main/model/Connections';
import { PlaygroundConnection } from 'main/model/PlaygroundConnection';
import { IpcMain } from 'electron';

export type NewPlaygroundEvent = Event<{ type: DBType; version: string }>;
export type StopPlaygroundEvent = Event<{ conId: string }>;
export type DeletePlaygroundEvent = Event<{ pgrounId: number }>;
export type ConnectToPlaygroundEvent = Event<{
    pground: PlaygroundConnection;
    processId: string;
}>;

export const PlaygroundEventController = (
    e: IpcMain,
    ser: PlaygroundInitService
) => {
    e.handle('new_playground', async (_, arg: NewPlaygroundEvent) => {
        return await ser.newPlayground(arg.Data.type, arg.Data.version);
    });

    e.handle(
        'connect_to_playground',
        async (_, arg: ConnectToPlaygroundEvent) => {
            const res = await ser.connectToLivePlayground(
                arg.Data.pground,
                arg.Data.processId
            );
            return res;
        }
    );

    e.handle('stop_playground', async (_, arg: StopPlaygroundEvent) => {
        return await ser.stopPlayground(arg.Data.conId);
    });

    e.handle('kill_all_playgrounds', async (_) => {
        return await ser.killAllPlaygrounds();
    });

    e.handle('delete_playground', async (_, arg: DeletePlaygroundEvent) => {
        return await ser.deletePlayground(arg.Data.pgrounId);
    });
};
