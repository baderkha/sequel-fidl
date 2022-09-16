/**
 * An Event template that can be used  extend this class to add more fields / functionalites
 */
export class Event<T> {
    Data: T;
    CreatedAt: Date;
    RespondTo: string;
    ErrorTo: string;
    constructor() {}

    WithData(d: T): this {
        this.Data = d;
        return this;
    }

    WithRespondTo(resTo: string): this {
        this.RespondTo = resTo;
        return this;
    }

    WithErrorTo(errTo: string): this {
        this.ErrorTo = errTo;
        return this;
    }

    Build(): this {
        this.CreatedAt = new Date();
        return this;
    }
}
