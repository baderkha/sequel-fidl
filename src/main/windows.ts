import path from 'path';
import { app, BrowserWindow, dialog, IpcMain, Menu, shell } from 'electron';
import { resolveHtmlPath } from './util';
import { broadcast } from './util/broadcast';
import { ConManager } from './service/Connections';
import { PlaygroundService } from './service/PlaygroundService';
import { SessionInfo, Sessions } from './service/Sessions';
import { Transactions } from './service/Transactions';

/**
 * Ask what to do with open transactions , resolves false when the user cancelled
 * @param win parent window (null => app modal)
 * @param conIDs connections with an open transaction
 */
/** "3 statements ran , 2 changed data (27 rows)." */
const pendingSummary = (conIDs: string[]) => {
    const log = conIDs.flatMap((id) => Transactions.log(id));
    if (!log.length) {
        return '';
    }
    const writes = log.filter((e) => !e.error && (e.affected || 0) > 0);
    const rows = writes.reduce((n, e) => n + (e.affected || 0), 0);
    return `${log.length} statement${log.length === 1 ? '' : 's'} ran${
        writes.length ? ` , ${writes.length} changed data (${rows} row${rows === 1 ? '' : 's'})` : ''
    }.\n\n`;
};

export async function resolveOpenTransactions(
    win: BrowserWindow | null,
    conIDs: string[]
): Promise<boolean> {
    if (!conIDs.length) {
        return true;
    }
    const many = conIDs.length > 1;
    const opts: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: [many ? 'Commit All' : 'Commit', many ? 'Discard All' : 'Discard Changes', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: many
            ? `${conIDs.length} windows have an open transaction`
            : 'This window has an open transaction',
        detail: `${pendingSummary(conIDs)}Commit the changes made in the transaction , or discard them (roll back).`,
    };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response === 2) {
        return false;
    }
    await Promise.all(
        conIDs.map((id) => (response === 0 ? Transactions.commit(id) : Transactions.rollback(id)))
    );
    return true;
}

/**
 * Two kinds of windows :
 *  - the launcher (one) : saved connections + playground manager
 *  - workspaces (many) : each one owns a single live connection , closing it disconnects
 */

export const SESSIONS_CHANGED_EV = 'sessions_changed';

const isDebug =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

const CASCADE_PX = 26;

let launcher: BrowserWindow | null = null;
/** set once the app is shutting down , quit does the cleanup for every window at once */
let quitting = false;
export const markQuitting = () => {
    quitting = true;
};
/** cleanups started by closed windows , quit waits for them before closing the app database */
const pendingCleanups = new Set<Promise<unknown>>();
export const waitForWindowCleanups = () => Promise.all(Array.from(pendingCleanups));
/** webContents id => the session the window shows */
const workspaces = new Map<number, { win: BrowserWindow; session: SessionInfo }>();

const baseWindow = (
    opts: Electron.BrowserWindowConstructorOptions
): BrowserWindow => {
    const win = new BrowserWindow({
        show: false,
        backgroundColor: '#181818',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 14, y: 12 },
        autoHideMenuBar: true,
        icon: path.join(RESOURCES_PATH, 'icon.png'),
        webPreferences: {
            webSecurity: false,
            sandbox: false,
            preload: app.isPackaged
                ? path.join(__dirname, 'preload.js')
                : path.join(__dirname, '../../.erb/dll/preload.js'),
        },
        ...opts,
    });
    win.loadURL(resolveHtmlPath('index.html'));
    win.once('ready-to-show', () => win.show());

    // open urls in the user's browser
    win.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
    });

    if (isDebug) {
        win.webContents.on('context-menu', (_, props) => {
            Menu.buildFromTemplate([
                {
                    label: 'Inspect element',
                    click: () => win.webContents.inspectElement(props.x, props.y),
                },
            ]).popup({ window: win });
        });
    }
    return win;
};

/** offset a new window from the focused one so they don't stack exactly */
const cascadeFrom = (width: number, height: number) => {
    const ref = BrowserWindow.getFocusedWindow();
    if (!ref) {
        return {};
    }
    const [x, y] = ref.getPosition();
    return { x: x + CASCADE_PX, y: y + CASCADE_PX, width, height };
};

/**
 * Show (or create) the connection manager window
 */
export function showLauncher(): BrowserWindow {
    if (launcher && !launcher.isDestroyed()) {
        if (launcher.isMinimized()) {
            launcher.restore();
        }
        launcher.show();
        launcher.focus();
        return launcher;
    }
    launcher = baseWindow({
        width: 860,
        height: 560,
        minWidth: 760,
        minHeight: 500,
        title: 'Sequel Fidl',
        // centred in the 52px header
        trafficLightPosition: { x: 18, y: 18 },
    });
    launcher.on('closed', () => {
        launcher = null;
    });
    return launcher;
}

/**
 * Open a workspace window for a live connection
 * @param session
 */
export function openWorkspace(session: SessionInfo): BrowserWindow {
    const win = baseWindow({
        width: 1360,
        height: 860,
        minWidth: 900,
        minHeight: 560,
        title: `${session.label} — Sequel Fidl`,
        ...cascadeFrom(1360, 860),
    });
    const id = win.webContents.id;
    workspaces.set(id, { win, session });

    // closing with an open transaction : commit / discard / cancel
    win.on('close', (ev) => {
        if (quitting || !Transactions.isOpen(session.conID)) {
            return;
        }
        ev.preventDefault();
        resolveOpenTransactions(win, [session.conID]).then((ok) => ok && win.close());
    });

    // the window is the session : closing it disconnects , and stops the playground when
    // nothing else is using it
    win.on('closed', () => {
        workspaces.delete(id);
        if (quitting) {
            return;
        }
        Sessions.remove(session.conID);
        const cleanup = ConManager.GetInstance()
            .Remove(session.conID, true)
            .then(() => PlaygroundService.Default().OnSessionClosed(session))
            .catch(console.log)
            .finally(() => {
                pendingCleanups.delete(cleanup);
                broadcast(SESSIONS_CHANGED_EV, {});
            });
        pendingCleanups.add(cleanup);
    });
    broadcast(SESSIONS_CHANGED_EV, {});
    return win;
}

export const hasWindows = () => BrowserWindow.getAllWindows().length > 0;

export const WindowEventController = (e: IpcMain) => {
    // which session (if any) the asking window shows , null => it's the launcher
    e.handle('window_session', (ev) => workspaces.get(ev.sender.id)?.session || null);

    e.handle('open_workspace', (_, arg: { Data: { conID: string } }) => {
        const session = Sessions.get(arg.Data.conID);
        if (!session) {
            return new Error('That connection is no longer open');
        }
        openWorkspace(session).focus();
        return null;
    });

    e.handle('show_launcher', () => {
        showLauncher();
    });
};
