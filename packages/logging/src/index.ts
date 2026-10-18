export { LOG_LEVELS, passesThreshold } from './levels';
export type { LogLevel } from './levels';

export { isScope } from './scope';

export { isEventName, assertEventName } from './event-name';

export { REDACTED, isDeniedField, redact, redactText } from './redaction';
export type { LogPayload } from './redaction';

export { describeFailure, messageOf, failureLine } from './record';
export type { LogRecord, LogSink, FailureDetail } from './record';

export { renderJson } from './render';

export { Logger } from './logger';
export type { LazyPayload } from './logger';

export { background, setBackgroundScope } from './background';
