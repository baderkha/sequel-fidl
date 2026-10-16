import { BrowserWindow, IpcMain } from 'electron';
import { WorkspaceService } from '../../service/WorkspaceService';
import { TerminalCreateInput, TerminalService } from '../../service/terminal/TerminalService';

type Arg<T> = { Data: T };

export const WorkspaceEventController = (e: IpcMain, ser: WorkspaceService, terms: TerminalService) => {
    e.handle('workspace_folder', (_, a: Arg<{ scope: string }>) => ser.Folder(a.Data.scope));
    e.handle('workspace_choose_folder', (ev, a: Arg<{ scope: string; label: string }>) =>
        ser.ChooseFolder(BrowserWindow.fromWebContents(ev.sender), a.Data.scope, a.Data.label)
    );
    e.handle('workspace_default_folder', (_, a: Arg<{ scope: string; label: string }>) =>
        ser.DefaultFolder(a.Data.scope, a.Data.label)
    );
    e.handle('workspace_tree', (_, a: Arg<{ scope: string }>) => ser.Tree(a.Data.scope));
    e.handle('workspace_read', (_, a: Arg<{ scope: string; rel: string }>) => ser.Read(a.Data.scope, a.Data.rel));
    e.handle('workspace_write', (_, a: Arg<{ scope: string; rel: string; content: string }>) =>
        ser.Write(a.Data.scope, a.Data.rel, a.Data.content)
    );
    e.handle('workspace_create_file', (_, a: Arg<{ scope: string; dir: string; name: string; content?: string }>) =>
        ser.CreateFile(a.Data.scope, a.Data.dir, a.Data.name, a.Data.content)
    );
    e.handle('workspace_create_folder', (_, a: Arg<{ scope: string; dir: string; name: string }>) =>
        ser.CreateFolder(a.Data.scope, a.Data.dir, a.Data.name)
    );
    e.handle('workspace_move', (_, a: Arg<{ scope: string; from: string; to: string }>) =>
        ser.Move(a.Data.scope, a.Data.from, a.Data.to)
    );
    e.handle('workspace_trash', (_, a: Arg<{ scope: string; rel: string }>) => ser.Trash(a.Data.scope, a.Data.rel));
    e.handle('workspace_copy_in', (_, a: Arg<{ scope: string; sources: string[]; dir: string }>) =>
        ser.CopyIn(a.Data.scope, a.Data.sources, a.Data.dir)
    );
    e.handle('workspace_reveal', (_, a: Arg<{ scope: string; rel: string }>) => ser.Reveal(a.Data.scope, a.Data.rel));
    e.handle('workspace_open_external', (_, a: Arg<{ scope: string; rel: string }>) =>
        ser.OpenExternal(a.Data.scope, a.Data.rel)
    );

    // one watcher per folder , released when the window that asked closes or stops watching
    const unwatch = new Map<number, () => void>();
    e.handle('workspace_watch', async (ev, a: Arg<{ scope: string }>) => {
        const id = ev.sender.id;
        unwatch.get(id)?.();
        unwatch.set(id, await ser.Watch(a.Data.scope));
        ev.sender.once('destroyed', () => {
            unwatch.get(id)?.();
            unwatch.delete(id);
        });
    });

    e.handle('terminal_create', (ev, a: Arg<TerminalCreateInput>) => terms.Create(ev.sender, a.Data));
    e.handle('terminal_write', (_, a: Arg<{ id: string; data: string }>) => terms.Write(a.Data.id, a.Data.data));
    e.handle('terminal_resize', (_, a: Arg<{ id: string; cols: number; rows: number }>) =>
        terms.Resize(a.Data.id, a.Data.cols, a.Data.rows)
    );
    e.handle('terminal_kill', (_, a: Arg<{ id: string }>) => terms.Kill(a.Data.id));
};
