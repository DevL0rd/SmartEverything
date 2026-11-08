import type { LogLevel } from './levels';
import type { LogPayload } from './payload';
import type { Runtime } from './scope';

export interface LogContext {
  readonly source?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly deviceId?: string;
  readonly actorId?: string;
  readonly platform?: 'ios' | 'android' | 'web' | 'server';
  readonly release?: string;
  readonly bundle?: string;
}

export interface FailureDetail {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: FailureDetail;
}

export interface LogRecord extends LogContext {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly runtime: Runtime;
  readonly scope: string;
  readonly event: string;
  readonly payload: LogPayload;
  readonly durationMs?: number;
  readonly failure?: FailureDetail;
}

export type LogSink = (record: LogRecord) => void;

function textAt(held: Record<string, unknown>, key: string): string {
  const value = held[key];
  return typeof value === 'string' ? value : '';
}

function reports(cause: unknown): cause is Record<string, unknown> {
  return typeof cause === 'object' && cause !== null && 'message' in cause;
}

function describeReported(cause: unknown): FailureDetail | null {
  if (!reports(cause)) {
    return null;
  }

  const held = cause;
  const message = textAt(held, 'message');

  if (message === '') {
    return null;
  }

  const beside = ['code', 'details', 'hint']
    .map((key) => ({ key, value: textAt(held, key) }))
    .filter((one) => one.value !== '')
    .map((one) => `${one.key}: ${one.value}`);

  return {
    name: textAt(held, 'name') === '' ? 'ReportedFailure' : textAt(held, 'name'),
    message: beside.length === 0 ? message : `${message} (${beside.join(', ')})`,
  };
}

function innerCause(cause: unknown, depth: number): FailureDetail | undefined {
  if (depth >= 1 || cause === undefined || cause === null) return undefined;
  if (!(cause instanceof Error)) return undefined;
  return describeFailure(cause, depth + 1);
}

export function describeFailure(cause: unknown, depth = 0): FailureDetail {
  if (cause instanceof Error) {
    const inner = innerCause(cause.cause, depth);
    return {
      name: cause.name,
      message: cause.message,
      ...(cause.stack === undefined ? {} : { stack: cause.stack }),
      ...(inner === undefined ? {} : { cause: inner }),
    };
  }

  return describeReported(cause) ?? { name: 'UnknownFailure', message: String(cause) };
}

export function messageOf(cause: unknown): string {
  return describeFailure(cause).message;
}

export function failureLine(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : messageOf(cause);
}
