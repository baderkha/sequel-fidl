import { BrowserWindow, dialog, shell } from 'electron';
import { existsSync, FSWatcher, promises as fs, watch } from 'fs';
import os from 'os';
import path from 'path';
import { GetPersistentDBConnection } from '../config';
import { WorkspaceFolder } from '../model/WorkspaceFolder';
import { broadcast } from '../util/broadcast';
import { BaseSQLRepository } from '../util/store/repository/sql';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';

export const WORKSPACE_CHANGED_EV = 'workspace_changed';

/** an entry of the project folder , paths relative to the folder use `/` */
export type FsEntry = {
    rel: string;
    name: string;
    dir: boolean;
    /** rel of the parent folder , '' = top level */
    parent: string;
};

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.idea', '.vscode']);
const MAX_ENTRIES = 5000;
const MAX_READ_BYTES = 5 * 1024 * 1024;

const toRel = (root: string, abs: string) => path.relative(root, abs).split(path.sep).join('/');
const safeName = (name: string) => name.trim().replace(/[\\/:]/g, '-');

/**
 * The project folder of each connection and the file operations the explorer needs
 */
export class WorkspaceService {
    private static _instance: WorkspaceService;
    private repo: BaseSQLRepository<WorkspaceFolder>;
    private roots = new Map<string, string>();
    private watchers = new Map<string, { watcher: FSWatcher; users: number }>();

    constructor(repo: BaseSQLRepository<WorkspaceFolder>) {
        this.repo = repo;
    }

    static Default(): WorkspaceService {
        if (!WorkspaceService._instance) {
            WorkspaceService._instance = new WorkspaceService(
                new BaseSQLRepository<WorkspaceFolder>(new WorkspaceFolder(), GetPersistentDBConnection())
            );
        }
        return WorkspaceService._instance;
    }

    async Folder(scope: string): Promise<string | null> {
        if (this.roots.has(scope)) {
            return this.roots.get(scope);
        }
        const row: any = await this.repo.getDb().findOne({ where: { scope } });
        const p = row && existsSync(row.path) ? row.path : null;
        if (p) this.roots.set(scope, p);
        return p;
    }

    private async root(scope: string): Promise<string> {
        const r = await this.Folder(scope);
        if (!r) throw new Error('No project folder is set for this connection');
        return r;
    }

    /** absolute path of `rel` , refusing anything outside the project folder */
    private inside(root: string, rel: string): string {
        const abs = path.resolve(root, rel || '.');
        if (abs !== root && !abs.startsWith(root + path.sep)) {
            throw new Error('That path is outside the project folder');
        }
        return abs;
    }

    async SetFolder(scope: string, folder: string): Promise<ErrorTuple<string>> {
        try {
            await fs.mkdir(folder, { recursive: true });
            const existing: any = await this.repo.getDb().findOne({ where: { scope } });
            if (existing) {
                await this.repo.getDb().update({ path: folder }, { where: { scope } });
            } else {
                await this.repo.getDb().create({ scope, path: folder });
            }
            this.roots.set(scope, folder);
            return NewErrorTuple(folder, null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    async ChooseFolder(win: BrowserWindow | null, scope: string, label: string): Promise<ErrorTuple<string | null>> {
        const opts: Electron.OpenDialogOptions = {
            title: 'Choose a project folder for your SQL files',
            buttonLabel: 'Use Folder',
            defaultPath: (await this.Folder(scope)) || path.join(os.homedir(), 'Documents'),
            properties: ['openDirectory', 'createDirectory'],
            message: `SQL files for ${label} are saved here`,
        };
        const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        if (res.canceled || !res.filePaths[0]) {
            return NewErrorTuple(null, null);
        }
        return this.SetFolder(scope, res.filePaths[0]);
    }

    /** ~/Documents/Sequel Fidl/<connection> */
    DefaultFolder(scope: string, label: string) {
        return this.SetFolder(scope, path.join(os.homedir(), 'Documents', 'Sequel Fidl', safeName(label) || 'Untitled'));
    }

    async Tree(scope: string): Promise<FsEntry[]> {
        const root = await this.root(scope);
        const out: FsEntry[] = [];
        const walk = async (dir: string) => {
            if (out.length >= MAX_ENTRIES) return;
            const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
            items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
            for (const it of items) {
                if (IGNORED.has(it.name) || out.length >= MAX_ENTRIES) continue;
                const abs = path.join(dir, it.name);
                const rel = toRel(root, abs);
                out.push({ rel, name: it.name, dir: it.isDirectory(), parent: toRel(root, dir) === '' ? '' : toRel(root, dir) });
                if (it.isDirectory()) await walk(abs);
            }
        };
        await walk(root);
        return out;
    }

    async Read(scope: string, rel: string): Promise<ErrorTuple<string>> {
        try {
            const abs = this.inside(await this.root(scope), rel);
            const stat = await fs.stat(abs);
            if (stat.size > MAX_READ_BYTES) {
                return NewErrorTuple(null, new Error(`${path.basename(abs)} is too large to open here`));
            }
            return NewErrorTuple(await fs.readFile(abs, 'utf8'), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    async Write(scope: string, rel: string, content: string): Promise<Error | null> {
        try {
            await fs.writeFile(this.inside(await this.root(scope), rel), content, 'utf8');
            return null;
        } catch (err) {
            return err as Error;
        }
    }

    private async create(scope: string, dirRel: string, name: string, kind: 'file' | 'dir', content = ''): Promise<ErrorTuple<string>> {
        try {
            const root = await this.root(scope);
            const abs = this.inside(root, path.posix.join(dirRel || '', safeName(name)));
            if (existsSync(abs)) {
                return NewErrorTuple(null, new Error(`"${path.basename(abs)}" already exists there`));
            }
            if (kind === 'dir') await fs.mkdir(abs, { recursive: true });
            else await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' });
            return NewErrorTuple(toRel(root, abs), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    CreateFile(scope: string, dirRel: string, name: string, content = '') {
        return this.create(scope, dirRel, name, 'file', content);
    }

    CreateFolder(scope: string, dirRel: string, name: string) {
        return this.create(scope, dirRel, name, 'dir');
    }

    /** rename and / or move , `toRel` is the new relative path */
    async Move(scope: string, fromRel: string, to: string): Promise<ErrorTuple<string>> {
        try {
            const root = await this.root(scope);
            const from = this.inside(root, fromRel);
            const dest = this.inside(root, to);
            if (dest === from) return NewErrorTuple(fromRel, null);
            if (dest.startsWith(from + path.sep)) {
                return NewErrorTuple(null, new Error("A folder can't be moved into itself"));
            }
            if (existsSync(dest)) {
                return NewErrorTuple(null, new Error(`"${path.basename(dest)}" already exists there`));
            }
            await fs.rename(from, dest);
            return NewErrorTuple(toRel(root, dest), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    /** moves to the Trash , so it can be restored from Finder */
    async Trash(scope: string, rel: string): Promise<Error | null> {
        try {
            await shell.trashItem(this.inside(await this.root(scope), rel));
            return null;
        } catch (err) {
            return err as Error;
        }
    }

    /** copy files / folders from anywhere (e.g. dragged from Finder) into a folder of the project */
    async CopyIn(scope: string, sources: string[], dirRel: string): Promise<ErrorTuple<string[]>> {
        try {
            const root = await this.root(scope);
            const destDir = this.inside(root, dirRel);
            const copied: string[] = [];
            for (const src of sources) {
                const ext = path.extname(src);
                const base = path.basename(src, ext);
                let target = path.join(destDir, `${base}${ext}`);
                for (let i = 1; existsSync(target); i++) {
                    target = path.join(destDir, `${base} copy${i > 1 ? ` ${i}` : ''}${ext}`);
                }
                if (path.resolve(src) === root || root.startsWith(path.resolve(src) + path.sep)) {
                    continue; // never copy the project into itself
                }
                await fs.cp(src, target, { recursive: true, errorOnExist: true, force: false });
                copied.push(toRel(root, target));
            }
            return NewErrorTuple(copied, null);
        } catch (err) {
            return NewErrorTuple([], err as Error);
        }
    }

    async Reveal(scope: string, rel: string) {
        const root = await this.root(scope);
        if (rel) shell.showItemInFolder(this.inside(root, rel));
        else shell.openPath(root);
    }

    /** open a file the editor can't show (e.g. an image) with its default app */
    async OpenExternal(scope: string, rel: string) {
        return shell.openPath(this.inside(await this.root(scope), rel));
    }

    /** watch the folder while a window shows it , every change is announced to the renderers */
    async Watch(scope: string): Promise<() => void> {
        const root = await this.Folder(scope);
        if (!root) return () => {};
        const existing = this.watchers.get(root);
        if (existing) {
            existing.users++;
        } else {
            let timer: NodeJS.Timeout = null;
            const watcher = watch(root, { recursive: true }, (_ev, file) => {
                if (file && String(file).split(path.sep).some((part) => IGNORED.has(part))) return;
                clearTimeout(timer);
                timer = setTimeout(() => broadcast(WORKSPACE_CHANGED_EV, { root }), 150);
            });
            watcher.on('error', () => {});
            this.watchers.set(root, { watcher, users: 1 });
        }
        return () => {
            const w = this.watchers.get(root);
            if (w && --w.users <= 0) {
                w.watcher.close();
                this.watchers.delete(root);
            }
        };
    }
}
