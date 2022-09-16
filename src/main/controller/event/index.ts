import { PlaygroundService } from 'main/service/PlaygroundService';
import { EventEmitter } from 'events';
import { BaseEventController } from './BaseEventController';
import { Event } from 'main/util/event';
import { DBType } from 'main/model/Connections';

export class PlayGroundEventController extends BaseEventController {
    private ser: PlaygroundService;

    constructor(ser: PlaygroundService, e: EventEmitter) {
        super(e);
        this.ser = ser;
    }

    async OnNewPlayground(
        ev: Event<{ type: DBType; version: string }>
    ): Promise<void> {
        const [res, err] = await this.ser.newPlayground(
            ev.Data.type,
            ev.Data.version
        );
        if (err) {
            return this.emitToErr(ev, err);
        }
        return this.emitToSuccess(ev, res);
    }
}
