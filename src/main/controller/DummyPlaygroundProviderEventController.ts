import { IpcMain } from 'electron';
import { PlaygroundInitService } from 'main/service/PlaygroundInitService';
import { SQLService } from 'main/service/SQLService';

export const DummyPlaygroundProviderEventController = (
    e: IpcMain,
    pser: PlaygroundInitService,
    sqlser: SQLService
) => {};
