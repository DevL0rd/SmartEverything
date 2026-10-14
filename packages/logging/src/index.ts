export { LOG_LEVELS, rankOf, passesThreshold } from './levels';
export type { LogLevel } from './levels';

export { RUNTIMES, isScope, assertScope, runtimeOf, areaOf, InvalidScopeError } from './scope';
export type { Runtime } from './scope';

export { isEventName, assertEventName, InvalidEventNameError } from './event-name';

export {
  REDACTED,
  DENIED_FIELDS,
  isDeniedField,
  redact,
  redactText,
  redactPreviewText,
} from './redaction';
export type { LogPayload } from './redaction';

export { FOREGROUND, BACKGROUND, RESET, BOLD, paint, withoutColour } from './palette';
export type { Colour } from './palette';

export { describeFailure } from './record';
export type { LogContext, LogRecord, LogSink, FailureDetail } from './record';

export { renderPretty, renderPlain, renderJson, renderBanner, colourOfLevel } from './render';

export { Logger } from './logger';
export type { ConsoleRouting, LoggerSettings, Operation, OutputStyle } from './logger';
