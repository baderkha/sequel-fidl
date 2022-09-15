import { EventEmitter } from 'events';

export const pubsub = new EventEmitter();

export const SHUTDOWN_SERVICE_EV = 'SERVICE_SHUTDOWN_EVENT';
export const STARTUP_SERVICE_EV = 'STARTUP_SERVICE_EV';
export const UNEXPECTED_ERROR_LOG = 'UNEXPECTED_ERROR_LOG';
