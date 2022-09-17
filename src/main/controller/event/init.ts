import { ipcMain } from 'electron';
import { PlaygroundInitService } from '../../service/PlaygroundInitService';
import { SQLService } from '../../service/SQLService';
import { PlaygroundEventController } from './PlaygroundEventController';
import { SQLEventController } from './SQLEventController';

export const InitEventListeners = (): void => {
    PlaygroundEventController(ipcMain, PlaygroundInitService.Default());
    SQLEventController(ipcMain, SQLService.Default());
};
