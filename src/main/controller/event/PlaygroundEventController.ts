import { IpcMain } from 'electron';
import { NewPlaygroundInput, PlaygroundService } from '../../service/PlaygroundService';
import { Event } from '../../util/event';
import { SAMPLES } from '../../service/samples';

export class NewPlaygroundEvent extends Event<NewPlaygroundInput> {}
export class PlaygroundIdEvent extends Event<{ id: number }> {}
export class RenamePlaygroundEvent extends Event<{ id: number; name: string }> {}

export const PlaygroundEventController = (e: IpcMain, ser: PlaygroundService) => {
    e.handle('docker_available', () => ser.DockerAvailable());
    e.handle('list_samples', () =>
        SAMPLES.map(({ id, name, description, database, type }) => ({ id, name, description, database, type }))
    );
    e.handle('list_playgrounds', () => ser.List());
    e.handle('create_playground', (_, arg: NewPlaygroundEvent) => ser.Create(arg.Data));
    e.handle('rename_playground', (_, arg: RenamePlaygroundEvent) =>
        ser.Rename(arg.Data.id, arg.Data.name)
    );
    e.handle('open_playground', (_, arg: PlaygroundIdEvent) => ser.Open(arg.Data.id));
    e.handle('stop_playground', (_, arg: PlaygroundIdEvent) => ser.Stop(arg.Data.id));
    e.handle('delete_playground', (_, arg: PlaygroundIdEvent) => ser.Delete(arg.Data.id));
};
