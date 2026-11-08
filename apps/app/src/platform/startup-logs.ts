import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOG_RECORD, type RuntimeLogRecord } from '@smarteverything/domain';
import { Logger, shippedRecord, type LogRecord } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText } from '../format/json-text';
import {
  BATCH_BYTES,
  OFFLINE_BUFFER_BYTES,
  queued,
  sizeOf,
  withinBuffer,
  type QueuedRecord,
} from './log-batch';
import { confirmStartupScope, type StartupScope } from './startup-log-scope';

const KEY = 'smarteverything.runtime-log-startup-scope';
const SCHEMA = z.strictObject({ scope: z.string().min(1), since: z.number() });
const log = new Logger('app.startup-logs');
const bootAt = Date.now();

let pending: QueuedRecord[] = [];
let pendingBytes = 0;
let collecting = true;
let binding: Promise<void> = Promise.resolve();

export function keepStartupLog(record: LogRecord): void {
  if (!collecting || record.scope === log.scope) return;
  if (record.level !== 'warn' && record.level !== 'error' && record.level !== 'exception') return;
  const parsed = LOG_RECORD.safeParse(shippedRecord(record));
  if (!parsed.success) {
    log.warn('startup_log.not_kept', { reason: parsed.error.message });
    return;
  }
  const item = queued(parsed.data);
  if (item.bytes > BATCH_BYTES) {
    log.warn('startup_log.too_large', { event: record.event, bytes: item.bytes });
    return;
  }
  pending.push(item);
  pendingBytes += item.bytes;
  if (pendingBytes <= OFFLINE_BUFFER_BYTES) return;
  pending = withinBuffer(pending);
  pendingBytes = sizeOf(pending);
}

async function readScope(): Promise<StartupScope | null> {
  const text = await AsyncStorage.getItem(KEY);
  if (text === null) return null;
  const decoded = jsonText(text);
  const result = decoded.ok ? SCHEMA.safeParse(decoded.value) : null;
  if (result?.success === true) return result.data;
  log.warn('startup_scope.unreadable');
  return null;
}

function clearStartupLogs(): void {
  pending = [];
  pendingBytes = 0;
}

type RetainStartup = (records: readonly RuntimeLogRecord[]) => Promise<void>;

export function bindStartupLogs(
  scope: string,
  current: () => boolean,
  retain: RetainStartup,
): Promise<void> {
  collecting = false;
  binding = binding
    .then(() =>
      confirmStartupScope(
        {
          bootAt,
          now: Date.now,
          read: readScope,
          write: (identity) => AsyncStorage.setItem(KEY, JSON.stringify(identity)),
          clear: clearStartupLogs,
          restore: async (prior, before) => {
            const { readProcessExitLogs } = await import('./last-exit');
            const exits = await readProcessExitLogs(prior.since, before);
            if (!current()) return false;
            const records = exits.map((exit) => LOG_RECORD.parse(shippedRecord(exit)));
            await retain([...pending.map((item) => item.record), ...records]);
            clearStartupLogs();
            return true;
          },
        },
        scope,
        current,
      ),
    )
    .catch((cause: unknown) => {
      log.warn('startup_logs.not_restored', { reason: String(cause) });
    });
  return binding;
}
