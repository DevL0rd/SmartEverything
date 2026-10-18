import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Logger, isDeniedField, isEventName, type LogLevel } from '@smarteverything/logging';

interface NativeLogEvents {
  readonly onLog: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class DiagnosticsLogNative extends NativeModule<NativeLogEvents> {
  setLogLevel(level: string): boolean;
}

const log = new Logger('app.native');

const RESERVED = new Set(['level', 'scope', 'event', 'at', 'seq', 'thread', 'durationMs']);

const NATIVE_LEVELS: ReadonlySet<string> = new Set(['trace', 'debug', 'info', 'warn', 'error']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nativeLevelFor(level: LogLevel): string {
  if (level === 'exception' || level === 'none') {
    return 'error';
  }
  return level;
}

function payloadOf(entry: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nativeScope: typeof entry['scope'] === 'string' ? entry['scope'] : 'unknown',
    nativeAt: entry['at'],
    nativeSeq: entry['seq'],
    nativeThread: entry['thread'],
  };
  if (typeof entry['durationMs'] === 'number') {
    payload['nativeDurationMs'] = entry['durationMs'];
  }
  for (const [name, value] of Object.entries(entry)) {
    if (RESERVED.has(name)) {
      continue;
    }
    payload[isDeniedField(name) ? `native_${name}` : name] = value;
  }
  return payload;
}

function write(level: string, event: string, payload: Record<string, unknown>): void {
  switch (level) {
    case 'trace':
      log.trace(event, payload);
      return;
    case 'debug':
      log.debug(event, payload);
      return;
    case 'warn':
      log.warn(event, payload);
      return;
    case 'error':
      log.error(event, undefined, payload);
      return;
    default:
      log.info(event, payload);
  }
}

function levelOf(entry: Record<string, unknown>): string {
  const level = entry['level'];
  return typeof level === 'string' && NATIVE_LEVELS.has(level) ? level : 'info';
}

export function forwardNativeLog(raw: unknown): void {
  if (!isRecord(raw)) {
    log.warn('log.malformed', { received: typeof raw });
    return;
  }
  const name = raw['event'];
  if (typeof name === 'string' && isEventName(name)) {
    write(levelOf(raw), name, payloadOf(raw));
    return;
  }
  write(levelOf(raw), 'log.invalid_event', {
    ...payloadOf(raw),
    receivedEvent: String(name).slice(0, 80),
  });
}

let native: DiagnosticsLogNative | null = null;
let pushed = '';

export function syncNativeLogLevel(): void {
  const level = nativeLevelFor(Logger.level);
  if (native === null || level === pushed) {
    return;
  }
  pushed = level;
  try {
    native.setLogLevel(level);
  } catch (cause) {
    log.warn('level.sync_failed', {
      level,
      error: cause instanceof Error ? cause.message : 'unknown',
    });
  }
}

export function startNativeLogBridge(): void {
  if (native !== null) {
    return;
  }
  const found = requireOptionalNativeModule<DiagnosticsLogNative>('Diagnostics');
  if (found === null || typeof Reflect.get(found, 'setLogLevel') !== 'function') {
    return;
  }
  native = found;
  syncNativeLogLevel();
  found.addListener('onLog', forwardNativeLog);
  log.info('bridge.started', { level: pushed });
}
