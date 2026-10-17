"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFile = exports.loadURL = void 0;
const common_1 = require("electron/common");
const main_1 = require("electron/main");
const path = require("path");
const url = require("url");
let mainWindow = null;
// Quit when all windows are closed.
main_1.app.on('window-all-closed', () => {
    main_1.app.quit();
});
function decorateURL(url) {
    // safely add `?utm_source=default_app
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.append('utm_source', 'default_app');
    return parsedUrl.toString();
}
// Find the shortest path to the electron binary
const absoluteElectronPath = process.execPath;
const relativeElectronPath = path.relative(process.cwd(), absoluteElectronPath);
const electronPath = absoluteElectronPath.length < relativeElectronPath.length
    ? absoluteElectronPath
    : relativeElectronPath;
const indexPath = path.resolve(main_1.app.getAppPath(), 'index.html');
function isTrustedSender(webContents) {
    if (webContents !== (mainWindow && mainWindow.webContents)) {
        return false;
    }
    try {
        return url.fileURLToPath(webContents.getURL()) === indexPath;
    }
    catch {
        return false;
    }
}
main_1.ipcMain.handle('bootstrap', (event) => {
    return isTrustedSender(event.sender) ? electronPath : null;
});
async function createWindow(backgroundColor) {
    await main_1.app.whenReady();
    const options = {
        width: 960,
        height: 620,
        autoHideMenuBar: true,
        backgroundColor,
        webPreferences: {
            preload: path.resolve(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        },
        useContentSize: true,
        show: false
    };
    if (process.platform === 'linux') {
        options.icon = path.join(__dirname, 'icon.png');
    }
    mainWindow = new main_1.BrowserWindow(options);
    mainWindow.on('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(details => {
        common_1.shell.openExternal(decorateURL(details.url));
        return { action: 'deny' };
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, done) => {
        const parsedUrl = new URL(webContents.getURL());
        const options = {
            title: 'Permission Request',
            message: `Allow '${parsedUrl.origin}' to access '${permission}'?`,
            buttons: ['OK', 'Cancel'],
            cancelId: 1
        };
        main_1.dialog.showMessageBox(mainWindow, options).then(({ response }) => {
            done(response === 0);
        });
    });
    return mainWindow;
}
const loadURL = async (appUrl) => {
    mainWindow = await createWindow();
    mainWindow.loadURL(appUrl);
    mainWindow.focus();
};
exports.loadURL = loadURL;
const loadFile = async (appPath) => {
    mainWindow = await createWindow(appPath === 'index.html' ? '#2f3241' : undefined);
    mainWindow.loadFile(appPath);
    mainWindow.focus();
};
exports.loadFile = loadFile;
//# sourceMappingURL=default_app.js.map