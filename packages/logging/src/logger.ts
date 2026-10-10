import { assertEventName } from './event-name';
import { passesThreshold, type LogLevel } from './levels';
import type { Colour } from './palette';
import { redact, type LogPayload } from './redaction';
import { describeFailure, type LogContext, type LogRecord, type LogSink } from './record';
import { renderBanner, renderJson, renderPlain, renderPretty } from './render';
import { assertScope, runtimeOf, type Runtime } from './scope';

export type OutputStyle = 'pretty' | 'plain' | 'json';

export type ConsoleRouting = 'by-level' | 'log-only';

export interface LoggerSettings {
  readonly level: LogLevel;
  readonly style: OutputStyle;
  readonly context: LogContext;
  readonly sink: LogSink;
  readonly tap: LogSink | null;
  readonly now: () => Date;
  readonly consoleRouting: ConsoleRouting;
}

interface WriteExtras {
  readonly payload?: LogPayload | undefined;
  readonly durationMs?: number | undefined;
  readonly cause?: unknown;
}

export interface Operation {
  readonly succeeded: (payload?: LogPayload) => void;
  readonly failed: (cause: unknown, payload?: LogPayload) => void;
}

/* eslint-disable no-console -- the one place the codebase reaches the console; everything else
   goes through the logger, and `no-console` is an error everywhere else to keep it that way. */
function writeToConsole(record: LogRecord, style: OutputStyle, routing: ConsoleRouting): void {
  const line =
    style === 'json'
      ? renderJson(record)
      : style === 'plain'
        ? renderPlain(record)
        : renderPretty(record);

  if (routing === 'log-only') {
    console.log(line);
    return;
  }
  if (record.level === 'warn') {
    console.warn(line);
    return;
  }
  if (passesThreshold(record.level, 'error')) {
    console.error(line);
    return;
  }
  console.log(line);
}
/* eslint-enable no-console */

function systemClock(): Date {
  return new Date();
}

interface Settings {
  level: LogLevel;
  style: OutputStyle;
  context: LogContext;
  sink: LogSink | null;
  tap: LogSink | null;
  now: () => Date;
  consoleRouting: ConsoleRouting;
}

function defaultSettings(): Settings {
  return {
    level: 'info',
    style: 'pretty',
    context: {},
    sink: null,
    tap: null,
    now: systemClock,
    consoleRouting: 'by-level',
  };
}

let settings: Settings = defaultSettings();

export class Logger {
  readonly scope: string;
  readonly runtime: Runtime;

  private readonly own: LogContext;

  constructor(scope: string, context: LogContext = {}) {
    this.scope = assertScope(scope);
    this.runtime = runtimeOf(scope);
    this.own = context;
  }

  static configure(changes: Partial<LoggerSettings>): void {
    if (changes.level !== undefined) settings.level = changes.level;
    if (changes.style !== undefined) settings.style = changes.style;
    if (changes.sink !== undefined) settings.sink = changes.sink;
    if (changes.tap !== undefined) settings.tap = changes.tap;
    if (changes.now !== undefined) settings.now = changes.now;
    if (changes.consoleRouting !== undefined) settings.consoleRouting = changes.consoleRouting;
    settings.context = { ...settings.context, ...changes.context };
  }

  static reset(): void {
    settings = defaultSettings();
  }

  static get level(): LogLevel {
    return settings.level;
  }

  static beginAction(correlationId: string): void {
    settings.context = { ...settings.context, correlationId };
  }

  child(context: LogContext): Logger {
    return new Logger(this.scope, { ...this.own, ...context });
  }

  forArea(scope: string): Logger {
    return new Logger(scope, this.own);
  }

  trace(event: string, payload?: LogPayload): void {
    this.write('trace', event, { payload });
  }

  debug(event: string, payload?: LogPayload): void {
    this.write('debug', event, { payload });
  }

  info(event: string, payload?: LogPayload): void {
    this.write('info', event, { payload });
  }

  warn(event: string, payload?: LogPayload): void {
    this.write('warn', event, { payload });
  }

  error(event: string, cause?: unknown, payload?: LogPayload): void {
    this.write('error', event, { payload, cause });
  }

  exception(event: string, cause: unknown, payload?: LogPayload): void {
    this.write('exception', event, { payload, cause });
  }

  highlight(text: string, colour: Colour = 'blue'): void {
    if (!passesThreshold('info', settings.level)) {
      return;
    }
    if (settings.sink !== null || settings.style !== 'pretty') {
      this.info('logger.highlighted', { text });
      return;
    }
    // eslint-disable-next-line no-console
    console.log(renderBanner(text, colour));
  }

  operation(event: string, payload: LogPayload = {}): Operation {
    assertEventName(event);
    const startedAt = settings.now().getTime();
    this.write('debug', `${event}.started`, { payload });

    return {
      succeeded: (endPayload: LogPayload = {}): void => {
        this.write('info', `${event}.succeeded`, {
          payload: { ...payload, ...endPayload },
          durationMs: this.since(startedAt),
        });
      },
      failed: (cause: unknown, endPayload: LogPayload = {}): void => {
        this.write('error', `${event}.failed`, {
          payload: { ...payload, ...endPayload },
          durationMs: this.since(startedAt),
          cause,
        });
      },
    };
  }

  private since(startedAt: number): number {
    return settings.now().getTime() - startedAt;
  }

  private write(level: LogLevel, event: string, extra: WriteExtras = {}): void {
    const { payload = {}, durationMs, cause } = extra;
    assertEventName(event);
    if (!passesThreshold(level, settings.level)) {
      return;
    }

    const record: LogRecord = {
      ...settings.context,
      ...this.own,
      timestamp: settings.now().toISOString(),
      level,
      runtime: this.runtime,
      scope: this.scope,
      event,
      payload: redact(payload),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(cause === undefined ? {} : { failure: describeFailure(cause) }),
    };

    settings.tap?.(record);
    if (settings.sink === null) {
      writeToConsole(record, settings.style, settings.consoleRouting);
      return;
    }
    settings.sink(record);
  }
}
