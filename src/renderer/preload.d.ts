import { Channels } from 'main/preload';

declare global {
    interface Window {
        electron: {
            ipcRenderer: {
                sendMessage(channel: Channels, args: unknown[]): void;
                on(
                    channel: string,
                    func: (...args: unknown[]) => void
                ): (() => void) | undefined;
                once(channel: string, func: (...args: unknown[]) => void): void;
                invoke(channel: string, arg: unknown): Promise<any>;
                invokeAs<T>(channel: string, arg: any): Promise<T>;
            };
            __dirname: string;
        };
    }
}

export {};
