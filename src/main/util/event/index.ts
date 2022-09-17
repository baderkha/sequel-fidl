/**
 * An Event template that can be used  extend this class to add more fields / functionalites
 */
export class Event<T> {
    Data: T;
    CreatedAt: Date;
    constructor() {}

    WithData(d: T): this {
        this.Data = d;
        return this;
    }

    Build(): this {
        this.CreatedAt = new Date();
        return this;
    }
}
