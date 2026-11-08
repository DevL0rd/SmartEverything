import { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { LOG_EVENT } from './protocol';

export type RelayedLog = z.output<typeof LOG_EVENT>;

function failureOf(record: RelayedLog): Error | undefined {
  if (record.failure === undefined) {
    return undefined;
  }
  const error = new Error(record.failure.message);
  error.name = record.failure.name;
  if (record.failure.stack !== undefined) {
    error.stack = record.failure.stack;
  }
  return error;
}

export function relayLog(record: RelayedLog): void {
  const log = new Logger(record.scope);
  switch (record.level) {
    case 'trace':
      log.trace(record.event, record.payload);
      return;
    case 'debug':
      log.debug(record.event, record.payload);
      return;
    case 'info':
      log.info(record.event, record.payload);
      return;
    case 'warn':
      log.warn(record.event, record.payload);
      return;
    case 'error':
      log.error(record.event, failureOf(record), record.payload);
      return;
    case 'exception':
      log.exception(record.event, failureOf(record), record.payload);
      return;
    case 'none':
      return;
  }
}
