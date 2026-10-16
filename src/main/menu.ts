import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell } from 'electron';

export type MenuActions = {
    /** show the connection manager */
    openLauncher: () => void;
};

/** ask the focused workspace window to do something (it ignores what it doesn't know) */
const sendToFocused = (channel: string) => () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send(channel);
    }
};

const focused = () => BrowserWindow.getFocusedWindow();

/**
 * App menu , every window shares it so the items act on the focused window
 * @param actions
 */
export default function buildAppMenu(actions: MenuActions): Menu {
    const isDebug =
        process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';
    const isMac = process.platform === 'darwin';

    const template: MenuItemConstructorOptions[] = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  } as MenuItemConstructorOptions,
              ]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Worksheet',
                    accelerator: 'CmdOrCtrl+N',
                    click: sendToFocused('menu_new_worksheet'),
                },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: sendToFocused('menu_save'),
                },
                {
                    label: 'Save As…',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: sendToFocused('menu_save_as'),
                },
                {
                    label: 'Open Folder…',
                    accelerator: 'CmdOrCtrl+O',
                    click: sendToFocused('menu_open_folder'),
                },
                { type: 'separator' },
                {
                    label: 'New Connection…',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    click: actions.openLauncher,
                },
                { type: 'separator' },
                { role: 'close' },
                ...(isMac ? [] : [{ role: 'quit' } as MenuItemConstructorOptions]),
            ],
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                ...(isDebug
                    ? [
                          {
                              label: 'Reload',
                              accelerator: 'CmdOrCtrl+R',
                              click: () => focused()?.webContents.reload(),
                          },
                          {
                              label: 'Toggle Developer Tools',
                              accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
                              click: () => focused()?.webContents.toggleDevTools(),
                          },
                          { type: 'separator' } as MenuItemConstructorOptions,
                      ]
                    : []),
                {
                    label: 'Terminal',
                    accelerator: 'Ctrl+`',
                    click: sendToFocused('menu_toggle_terminal'),
                },
                {
                    label: 'New Terminal',
                    accelerator: 'Ctrl+Shift+`',
                    click: sendToFocused('menu_new_terminal'),
                },
                {
                    label: 'New MySQL Terminal',
                    click: sendToFocused('menu_new_mysql_terminal'),
                },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                {
                    label: 'Connections',
                    click: actions.openLauncher,
                },
                ...(isMac
                    ? [
                          { type: 'separator' } as MenuItemConstructorOptions,
                          { role: 'front' } as MenuItemConstructorOptions,
                      ]
                    : []),
            ],
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'MySQL Reference Manual',
                    click: () => shell.openExternal('https://dev.mysql.com/doc/refman/8.4/en/'),
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
}
