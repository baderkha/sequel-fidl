import { Event } from '../../util/event';
import { EventEmitter } from 'events';

export class BaseEventController {
    protected emitter: EventEmitter;
    constructor(e: EventEmitter) {
        this.emitter = e;
    }

    protected emitToErr(ev: Event<any>, err: Error) {
        const errEv = new Event<Error>().WithData(err).Build();
        this.emitter.emit(ev.ErrorTo, errEv);
    }

    protected emitToSuccess<T>(ev: Event<any>, data: T) {
        const evSuccess = new Event<T>().WithData(data);
        this.emitter.emit(ev.RespondTo, evSuccess);
    }
}
