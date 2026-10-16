import { BrowserWindow } from 'electron';

/**
 * Push an event to every renderer window
 * @param channel
 * @param payload
 */
export const broadcast = (channel: string, payload: unknown) => {
    BrowserWindow.getAllWindows().forEach((win) => {
        try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(channel, payload);
            }
        } catch (err) {
            // a window closing mid-send isn't worth failing the caller over
        }
    });
};
