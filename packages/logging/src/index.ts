export { LOG_LEVELS, passesThreshold } from './levels';
export type { LogLevel } from './levels';

export { isScope } from './scope';

export { isEventName, assertEventName } from './event-name';

export { REDACTED, clip, payloadOf } from './payload';
export type { LogPayload } from './payload';

export { shippedRecord } from './shipment';
export type { LogPlatform, ShippedLogRecord } from './shipment';

export { describeFailure, messageOf, failureLine } from './record';
export type { LogRecord, LogSink, FailureDetail } from './record';

export { renderJson } from './render';

export { componentOf, componentArea } from './component';

export { errorSignature, signatureText } from './signature';
export type { SignatureInput } from './signature';

export { Logger } from './logger';
export type { LazyPayload } from './logger';

export { background, setBackgroundScope } from './background';
