import { IpcMain } from 'electron';
import { WorksheetService } from '../../service/WorksheetService';

type Arg<T> = { Data: T };

export const WorksheetEventController = (e: IpcMain, ser: WorksheetService) => {
    e.handle('worksheet_tree', (_, arg: Arg<{ scope: string }>) => ser.Tree(arg.Data.scope));
    e.handle(
        'create_worksheet',
        (_, arg: Arg<{ scope: string; name: string; sql?: string; folderId?: number | null }>) =>
            ser.Create(arg.Data.scope, arg.Data.name, arg.Data.sql, arg.Data.folderId ?? null)
    );
    e.handle(
        'update_worksheet',
        (_, arg: Arg<{ id: number; name?: string; sql?: string; folderId?: number | null }>) =>
            ser.Update(arg.Data.id, arg.Data)
    );
    e.handle('delete_worksheet', (_, arg: Arg<{ id: number }>) => ser.Delete(arg.Data.id));
    e.handle('create_folder', (_, arg: Arg<{ scope: string; name: string; parentId: number | null }>) =>
        ser.CreateFolder(arg.Data.scope, arg.Data.name, arg.Data.parentId)
    );
    e.handle('update_folder', (_, arg: Arg<{ id: number; name?: string; parentId?: number | null }>) =>
        ser.UpdateFolder(arg.Data.id, arg.Data)
    );
    e.handle('delete_folder', (_, arg: Arg<{ id: number }>) => ser.DeleteFolder(arg.Data.id));
};
