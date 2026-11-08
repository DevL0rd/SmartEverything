import type { RuntimeLogRow } from '@smarteverything/domain';
import { shippedRecord, type LogRecord } from '@smarteverything/logging';

export interface LogFailure {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: LogFailure;
}

export interface StoredLogRecord {
  readonly at: string;
  readonly recordedAt: string;
  readonly source: string;
  readonly runtime: RuntimeLogRow['runtime'];
  readonly platform: RuntimeLogRow['platform'];
  readonly deviceId: string | null;
  readonly clientId: string | null;
  readonly scope: string;
  readonly event: string;
  readonly level: RuntimeLogRow['level'];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly failure: LogFailure | null;
  readonly durationMs: number | null;
  readonly release?: string;
  readonly bundle?: string;
  readonly hubBootRunId?: string;
  readonly repairOrigin?: string;
}

export interface StorePlacement {
  readonly source: string;
  readonly clientId: string | null;
  readonly deviceId: string | null;
  readonly now: string;
}

export function storedFromLog(record: LogRecord, place: StorePlacement): StoredLogRecord | null {
  if (record.level === 'none') return null;
  const safe = shippedRecord(record, record.platform ?? 'server');
  return {
    at: safe.timestamp,
    recordedAt: place.now,
    source: place.source,
    runtime: safe.runtime,
    platform: safe.platform,
    deviceId: place.deviceId,
    clientId: place.clientId,
    scope: safe.scope,
    event: safe.event,
    level: safe.level,
    payload: safe.payload,
    failure: safe.failure ?? null,
    durationMs: safe.durationMs ?? null,
    ...(safe.release === undefined ? {} : { release: safe.release }),
    ...(safe.bundle === undefined ? {} : { bundle: safe.bundle }),
  };
}

export function storedLogOf(
  record: LogRecord,
  source: LogSourceInfo,
  deviceId: string | null,
  now: string,
): StoredLogRecord | null {
  return storedFromLog(record, { source: source.source, clientId: source.clientId, deviceId, now });
}

export interface LogSourceInfo {
  readonly source: string;
  readonly runtime: RuntimeLogRow['runtime'];
  readonly platform: RuntimeLogRow['platform'];
  readonly deviceId: string | null;
  readonly clientId: string | null;
}

export interface LogAccess {
  readonly owner: boolean;
  readonly profileId: string | null;
}

export interface LogSearch {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly toId?: number | undefined;
  readonly level?: RuntimeLogRow['level'] | undefined;
  readonly scope?: string | undefined;
  readonly component?: string | undefined;
  readonly runtime?: RuntimeLogRow['runtime'] | undefined;
  readonly source?: string | undefined;
  readonly deviceIds?: readonly string[] | undefined;
  readonly text?: string | undefined;
  readonly signature?: string | undefined;
  readonly limit: number;
}

export interface LogAround {
  readonly id?: number | undefined;
  readonly at?: string | undefined;
  readonly before: number;
  readonly after: number;
  readonly level?: RuntimeLogRow['level'] | undefined;
  readonly component?: string | undefined;
  readonly runtime?: RuntimeLogRow['runtime'] | undefined;
  readonly deviceIds?: readonly string[] | undefined;
}
