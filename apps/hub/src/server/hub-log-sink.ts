import { Logger, messageOf, type LogRecord, type LogSink } from '@smarteverything/logging';
import { currentExecutionAuthority, withExecutionAuthority } from '../assistant/turn-authority';
import type { Store } from '../store/store';
import { storedFromLog, type StoredLogRecord } from '../store/repositories/runtime-log-types';
import { isHubServiceFatal } from '../store/repositories/repair-fingerprint';

export interface HubLogSinkOptions {
  readonly store: Pick<Store, 'runtimeLogs' | 'now'>;
  readonly failed: (cause: unknown) => void;
  readonly hubBootRunId?: string;
}

export interface HubLogSink {
  readonly sink: LogSink;
  readonly flush: () => void;
}

const HUB_SOURCE = 'hub:service';

const BATCH = 500;

const HUB_CLIENT = 'hub';

interface CapturedLog {
  readonly record: LogRecord;
  readonly repairOrigin: string | undefined;
}

function bySource(records: readonly CapturedLog[]): ReadonlyMap<string, readonly CapturedLog[]> {
  const groups = new Map<string, CapturedLog[]>();
  for (const record of records) {
    const source = record.record.source ?? HUB_SOURCE;
    const group = groups.get(source);
    if (group === undefined) groups.set(source, [record]);
    else group.push(record);
  }
  return groups;
}

function bootEvidence(
  record: StoredLogRecord | null,
  hubBootRunId: string | undefined,
): StoredLogRecord | null {
  if (record === null || hubBootRunId === undefined || !isHubServiceFatal(record)) return record;
  return { ...record, hubBootRunId };
}

function repairEvidence(
  record: StoredLogRecord | null,
  repairOrigin: string | undefined,
): StoredLogRecord | null {
  return record === null || repairOrigin === undefined ? record : { ...record, repairOrigin };
}

function write(options: HubLogSinkOptions, records: readonly CapturedLog[]): void {
  const { store, hubBootRunId } = options;
  const now = store.now().toISOString();
  for (const [source, group] of bySource(records)) {
    const stored = group
      .map(({ record, repairOrigin }) =>
        repairEvidence(
          bootEvidence(
            storedFromLog(record, { source, clientId: HUB_CLIENT, deviceId: null, now }),
            hubBootRunId,
          ),
          repairOrigin,
        ),
      )
      .filter((record) => record !== null);
    if (stored.length === 0) continue;
    const kept = store.runtimeLogs.append(stored, HUB_CLIENT);
    store.runtimeLogs.touch(
      { source, runtime: 'hub', platform: 'server', deviceId: null, clientId: HUB_CLIENT },
      now,
      kept,
      0,
    );
  }
}

export function hubLogSink(options: HubLogSinkOptions): HubLogSink {
  let pending: CapturedLog[] = [];
  let writing = false;
  let scheduled: NodeJS.Immediate | null = null;

  const flush = (): void => {
    if (scheduled !== null) clearImmediate(scheduled);
    scheduled = null;
    if (writing || pending.length === 0) return;
    const batch = pending;
    pending = [];
    writing = true;
    try {
      withExecutionAuthority(undefined, () => {
        write(options, batch);
      });
    } catch (cause) {
      options.failed(
        new Error(`The hub could not store its own logs: ${messageOf(cause)}`, { cause }),
      );
    } finally {
      writing = false;
    }
  };

  const sink: LogSink = (record): void => {
    if (writing) return;
    pending.push({ record, repairOrigin: currentExecutionAuthority()?.repair_origin });
    if (pending.length >= BATCH) {
      flush();
    } else if (scheduled === null) {
      scheduled = setImmediate(flush);
      scheduled.unref();
    }
  };

  return { sink, flush };
}

export function insideLogSink(existing: LogSink, added: LogSink): LogSink {
  return (record): void => {
    try {
      existing(record);
    } finally {
      added(record);
    }
  };
}

export function ingestOwnLogs(options: {
  readonly store: Pick<Store, 'runtimeLogs' | 'now'>;
  readonly log: Logger;
  readonly hubBootRunId?: string;
}): () => void {
  const owned = hubLogSink({
    store: options.store,
    ...(options.hubBootRunId === undefined ? {} : { hubBootRunId: options.hubBootRunId }),
    failed: (cause) => {
      options.log.error('logs.not_stored', cause);
    },
  });
  const held = Logger.sink;
  const base =
    held ??
    ((record): void => {
      Logger.write(record);
    });
  Logger.configure({ sink: insideLogSink(base, owned.sink) });
  return (): void => {
    Logger.configure({ sink: held });
    owned.flush();
  };
}
