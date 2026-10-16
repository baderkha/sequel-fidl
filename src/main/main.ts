/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import buildAppMenu from './menu';
import {
    hasWindows,
    resolveOpenTransactions,
    markQuitting,
    showLauncher,
    waitForWindowCleanups,
    WindowEventController,
} from './windows';
import { GetPersistentDBConnection } from './config';
import { ConManager } from './service/Connections';
import { Transactions } from './service/Transactions';
import { TerminalService } from './service/terminal/TerminalService';
import { ExportService } from './service/export/ExportService';
import { SHUTDOWN_SERVICE_EV } from './util/pubsub';
import { PlaygroundService } from './service/PlaygroundService';
import { InitEventListeners } from './controller/event/init';
import { clipboard } from 'electron';

class AppUpdater {
    constructor() {
        log.transports.file.level = 'info';
        autoUpdater.logger = log;
        autoUpdater.checkForUpdatesAndNotify();
    }
}

ipcMain.on('ipc-example', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.log(msgTemplate(arg));
    event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

const isDebug =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
    require('electron-debug')();
}

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
        .default(
            extensions.map((name) => installer[name]),
            forceDownload
        )
        .catch(console.log);
};

let extensionsInstalled = false;
const ensureExtensions = async () => {
    if (isDebug && !extensionsInstalled) {
        extensionsInstalled = true;
        await installExtensions();
    }
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// stop running playgrounds before quitting so mysql shuts down cleanly and nothing is left running
let cleanedUp = false;
app.on('before-quit', (ev) => {
    ipcMain.emit(SHUTDOWN_SERVICE_EV);
    if (cleanedUp) {
        return;
    }
    ev.preventDefault();
    if (quitPrompting) {
        return;
    }
    // open transactions first : commit / discard / cancel the quit
    quitPrompting = true;
    resolveOpenTransactions(null, Transactions.openIds()).then((ok) => {
        quitPrompting = false;
        if (ok) {
            shutdownAndQuit();
        }
    });
});

let quitPrompting = false;
let shuttingDown = false;
const shutdownAndQuit = () => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    markQuitting();
    const timeout = new Promise((r) => setTimeout(r, 30 * 1000));
    const shutdown = async () => {
        await waitForWindowCleanups();
        TerminalService.Default().KillAll();
        ExportService.Default().CancelAll();
        await PlaygroundService.Default().StopAll();
        await ConManager.GetInstance().RemoveAllAndKill([]);
    };
    Promise.race([shutdown(), timeout])
        .catch(console.log)
        // close sqlite last , a statement still running while node tears down aborts the process
        .then(() => GetPersistentDBConnection().close())
        .catch(console.log)
        .finally(() => {
            cleanedUp = true;
            app.quit();
        });
};

ipcMain.on('app_quit', () => {
    ipcMain.emit(SHUTDOWN_SERVICE_EV);
});

app.whenReady()
    .then(() => InitEventListeners(clipboard))
    .then(async () => {
        // dev runs inside Electron.app , show our icon in the dock instead of electron's
        if (process.platform === 'darwin' && !app.isPackaged) {
            app.dock.setIcon(path.join(__dirname, '../../assets/icon.png'));
        }
        WindowEventController(ipcMain);
        buildAppMenu({ openLauncher: showLauncher });
        await ensureExtensions();
        showLauncher();
        // Remove this if your app does not use auto updates
        // eslint-disable-next-line
        new AppUpdater();
        app.on('activate', () => {
            // dock click with no windows open => back to the connection manager
            if (!hasWindows()) {
                showLauncher();
            }
        });
    })
    .catch(console.log);
