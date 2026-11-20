import type { RuntimeLogAck, RuntimeLogBatch, RuntimeLogRecord } from '@smarteverything/domain';
import { componentOf, errorSignature, type LogRecord } from '@smarteverything/logging';
import { logRecordOf } from './record';
import { z } from 'zod';
import { allOf, type Sql } from '../store/sql';
import { LogAccessError, readFilter } from '../store/repositories/runtime-log-reads';
import { repairObservation } from '../store/repositories/repair-fingerprint';
import {
  storedLogOf,
  type LogAccess,
  type LogSourceInfo,
  type StoredLogRecord,
} from '../store/repositories/runtime-log-types';

export const HUB_CLIENT = 'hub';

export interface RepairEvidence {
  readonly record: StoredLogRecord;
  readonly fingerprint: string;
  readonly component: string;
  readonly logId: number;
}

export interface Appended {
  readonly kept: number;
  readonly evidence: readonly RepairEvidence[];
}

export interface IngestRequest {
  readonly access: LogAccess;
  readonly batch: RuntimeLogBatch;
  readonly source: LogSourceInfo;
  readonly deviceId: string | null;
  readonly now: string;
}

export interface Ingested {
  readonly ack: RuntimeLogAck;
  readonly evidence: readonly RepairEvidence[];
}

const LAST_ID = z.object({ id: z.int().positive() });

function asLogRecord(record: RuntimeLogRecord, source: LogSourceInfo): LogRecord {
  return { ...logRecordOf(record), runtime: source.runtime, platform: source.platform };
}

function failureFields(
  record: StoredLogRecord,
  component: string,
): { readonly failure: string | null; readonly signature: string | null } {
  if (record.failure === null) return { failure: null, signature: null };
  return {
    failure: JSON.stringify(record.failure),
    signature: errorSignature({
      component,
      event: record.event,
      failureName: record.failure.name,
      failureMessage: record.failure.message,
    }),
  };
}

export function checkIngestAccess(request: Pick<IngestRequest, 'access' | 'source'>): void {
  const { access, source } = request;
  if (!access.owner && access.profileId !== source.clientId) throw new LogAccessError();
}

export class LogWrites {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => string,
  ) {}

  append(records: readonly StoredLogRecord[], clientId: string, observe: boolean): Appended {
    return this.sql.transaction(() => this.appendWithin(records, clientId, observe));
  }

  ingest(request: IngestRequest): Ingested {
    const { access, batch, source, deviceId, now } = request;
    const clientId = source.clientId ?? HUB_CLIENT;
    const appended = this.sql.transaction(() => {
      const stored = this.appendWithin(
        batch.records
          .map((record) => storedLogOf(asLogRecord(record, source), source, deviceId, now))
          .filter((record) => record !== null),
        clientId,
        access.owner,
      );
      this.touch({ ...source, deviceId, clientId }, now, stored.kept, batch.dropped ?? 0);
      this.recordDroppedRange(source, batch);
      return stored;
    });
    return {
      ack: {
        stored: appended.kept,
        accepted: appended.kept,
        alreadyStored: batch.records.length - appended.kept,
        overflowed: (batch.dropped ?? 0) > 0,
      },
      evidence: appended.evidence,
    };
  }

  touch(source: LogSourceInfo, at: string, stored: number, dropped: number): void {
    this.sql.run(
      'record a runtime log source',
      `insert into runtime_log_sources (source, runtime, platform, device_id, client_id, first_at, last_at, records, dropped)
       values ($source, $runtime, $platform, $deviceId, $clientId, $at, $at, $stored, $dropped)
       on conflict (source, client_id) do update set
         runtime = excluded.runtime, platform = excluded.platform, device_id = excluded.device_id,
         last_at = excluded.last_at,
         records = runtime_log_sources.records + excluded.records,
         dropped = runtime_log_sources.dropped + excluded.dropped`,
      {
        source: source.source,
        runtime: source.runtime,
        platform: source.platform,
        deviceId: source.deviceId,
        clientId: source.clientId,
        at,
        stored,
        dropped,
      },
    );
  }

  recordGap(source: LogSourceInfo, firstSentAt: string, lastSentAt: string): number {
    return this.sql.run(
      'record the moments a source could not send',
      `insert into runtime_log_gaps (source, client_id, first_at, last_at, recorded_at)
       values ($source, $clientId, $firstSentAt, $lastSentAt, $recordedAt)
       on conflict (source, first_at, last_at) do nothing`,
      {
        source: source.source,
        clientId: source.clientId ?? HUB_CLIENT,
        firstSentAt,
        lastSentAt,
        recordedAt: this.now(),
      },
    );
  }

  drop(access: LogAccess, before: string | undefined): number {
    const filter = allOf([
      readFilter(access),
      ...(before === undefined ? [] : [{ text: 'at < $before', parameters: { before } }]),
    ]);
    return this.sql.transaction(() =>
      this.sql.run(
        'forget runtime logs',
        `delete from runtime_logs where ${filter.text}`,
        filter.parameters,
      ),
    );
  }

  private appendWithin(
    records: readonly StoredLogRecord[],
    clientId: string,
    observe: boolean,
  ): Appended {
    const evidence: RepairEvidence[] = [];
    let kept = 0;
    for (const record of records) {
      const stored = this.store(record, clientId, observe);
      if (stored === null) continue;
      kept += 1;
      if (stored !== true) evidence.push(stored);
    }
    return { kept, evidence };
  }

  private recordDroppedRange(source: LogSourceInfo, batch: RuntimeLogBatch): void {
    const firstSentAt = batch.oldestSentAt;
    if (firstSentAt === undefined || (batch.dropped ?? 0) === 0) return;
    const oldest = batch.records.reduce<string | null>(
      (first, record) => (first === null || record.timestamp < first ? record.timestamp : first),
      null,
    );
    if (oldest !== null && firstSentAt < oldest) this.recordGap(source, firstSentAt, oldest);
  }

  private store(
    record: StoredLogRecord,
    clientId: string,
    observe: boolean,
  ): RepairEvidence | true | null {
    const component = componentOf(record.scope, record.source);
    const inserted = this.sql.run(
      'store a runtime log record',
      `insert into runtime_logs (at, source, runtime, platform, device_id, client_id, component, level, scope, event, payload, failure, signature, duration_ms, recorded_at, release, bundle)
       select $at, $source, $runtime, $platform, $deviceId, $clientId, $component, $level, $scope, $event, $payload, $failure, $signature, $durationMs, $now, $release, $bundle
       where not exists (
         select 1 from runtime_logs where source = $source and at = $at and event = $event
           and scope = $scope and payload = $payload
           and (client_id = $clientId or (client_id is null and $clientId = $hub))
           and level = $level and failure is $failure and duration_ms is $durationMs
       )`,
      {
        at: record.at,
        source: record.source,
        runtime: record.runtime,
        platform: record.platform,
        deviceId: record.deviceId,
        clientId,
        component,
        level: record.level,
        scope: record.scope,
        event: record.event,
        payload: JSON.stringify(record.payload),
        ...failureFields(record, component),
        durationMs: record.durationMs,
        release: record.release ?? null,
        bundle: record.bundle ?? null,
        now: record.recordedAt,
        hub: HUB_CLIENT,
      },
    );
    if (inserted === 0) return null;
    const observation = observe ? repairObservation(record) : null;
    if (observation === null) return true;
    const logId = this.sql.get(LAST_ID, 'select last_insert_rowid() as id');
    if (logId === undefined) throw new Error('The stored runtime log record has no id.');
    return {
      record,
      fingerprint: observation.fingerprint,
      component: observation.component,
      logId: logId.id,
    };
  }
}
