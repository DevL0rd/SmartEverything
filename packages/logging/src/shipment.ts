import { clip, payloadOf, type LogPayload } from './payload';
import type { FailureDetail, LogContext, LogRecord } from './record';
import type { Runtime } from './scope';

export type LogPlatform = NonNullable<LogRecord['platform']>;

export interface ShippedLogRecord extends Omit<LogContext, 'platform' | 'source'> {
  readonly timestamp: string;
  readonly level: Exclude<LogRecord['level'], 'none'>;
  readonly runtime: Runtime;
  readonly platform: LogPlatform;
  readonly scope: string;
  readonly event: string;
  readonly payload: LogPayload;
  readonly durationMs?: number;
  readonly failure?: FailureDetail;
}

const LONGEST_NAME = 120;

const LONGEST_MESSAGE = 2000;

const LONGEST_STACK = 20_000;

const LONGEST_RELEASE = 40;

const LONGEST_CONTEXT = 120;

const SERVER_RUNTIMES: readonly Runtime[] = ['hub', 'db', 'tool'];

const PLATFORMS = ['ios', 'android', 'web', 'server'] as const;

const CONTEXT_FIELDS = [
  'release',
  'bundle',
  'deviceId',
  'actorId',
  'correlationId',
  'requestId',
] as const;

function textFor(value: string | undefined, longest: number, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  const scrubbed = textOf(value, longest);
  return scrubbed === '' ? fallback : scrubbed;
}

function textOf(value: string, longest: number): string {
  return clip(value, longest);
}

function payloadFor(payload: LogPayload): LogPayload {
  return payloadOf(payload);
}

function failureOf(cause: FailureDetail | undefined): Record<string, FailureDetail> {
  if (cause === undefined) {
    return {};
  }
  const named = textFor(cause.name, LONGEST_NAME, 'UnnamedFailure');
  const stack = cause.stack === undefined ? {} : { stack: textOf(cause.stack, LONGEST_STACK) };
  const inner =
    cause.cause === undefined ? undefined : (failureOf(cause.cause)['failure'] ?? undefined);
  return {
    failure: {
      name: named,
      message: textFor(cause.message, LONGEST_MESSAGE, 'no message'),
      ...stack,
      ...(inner === undefined ? {} : { cause: inner }),
    },
  };
}

function contextOf(record: LogRecord): LogPayload {
  const kept: Record<string, unknown> = {};
  for (const name of CONTEXT_FIELDS) {
    const value = record[name];
    if (typeof value === 'string') {
      kept[name] = textFor(
        value,
        name === 'release' ? LONGEST_RELEASE : LONGEST_CONTEXT,
        'unknown',
      );
    }
  }
  return kept;
}

function platformOf(reported: LogRecord): LogPlatform {
  const held = PLATFORMS.find((candidate) => candidate === reported.platform);
  if (held !== undefined) {
    return held;
  }
  const server = SERVER_RUNTIMES.find((candidate) => candidate === reported.runtime);
  if (server === undefined) {
    throw new Error(
      `A ${reported.runtime} log record shipped from ${reported.scope} carries no platform, so the hub cannot tell where it came from`,
    );
  }
  return 'server';
}

export function shippedRecord(reported: LogRecord, platform?: LogPlatform): ShippedLogRecord {
  if (reported.level === 'none') {
    throw new Error(
      `A ${reported.runtime} log record in ${reported.scope} has level none, so there is nothing to ship`,
    );
  }
  const chosen = platform ?? platformOf(reported);
  return {
    ...contextOf(reported),
    ...failureOf(reported.failure),
    timestamp: reported.timestamp,
    level: reported.level,
    runtime: reported.runtime,
    platform: chosen,
    scope: textFor(reported.scope, LONGEST_CONTEXT, 'app.unnamed'),
    event: textFor(reported.event, LONGEST_NAME, 'event.unnamed'),
    payload: payloadFor(reported.payload),
    ...(reported.durationMs === undefined ? {} : { durationMs: reported.durationMs }),
  };
}
