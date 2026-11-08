import type { RuntimeLogAck, RuntimeLogBatch, RuntimeLogRecord } from '@smarteverything/domain';
import { componentOf, errorSignature, type LogRecord } from '@smarteverything/logging';
import { LogAccessError, RuntimeLogReads } from './runtime-log-reads';
import { repairObservation } from './repair-fingerprint';
import { AiRepairInboxRepository } from './ai-repair-inbox';
import { storedLogOf } from './runtime-log-types';
import type { LogAccess, LogSourceInfo, StoredLogRecord } from './runtime-log-types';

const HUB_CLIENT = 'hub';

function failureOf(failure: RuntimeLogRecord['failure']): Pick<LogRecord, 'failure'> {
  if (failure === undefined) return {};
  return {
    failure: {
      name: failure.name,
      message: failure.message,
      ...(failure.stack === undefined ? {} : { stack: failure.stack }),
      ...(failure.cause === undefined
        ? {}
        : {
            cause: {
              name: failure.cause.name,
              message: failure.cause.message,
              ...(failure.cause.stack === undefined ? {} : { stack: failure.cause.stack }),
            },
          }),
    },
  };
}

function asLogRecord(record: RuntimeLogRecord, source: LogSourceInfo): LogRecord {
  return {
    timestamp: record.timestamp,
    level: record.level,
    runtime: source.runtime,
    platform: source.platform,
    scope: record.scope,
    event: record.event,
    payload: record.payload ?? {},
    ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
    ...failureOf(record.failure),
    ...(record.release === undefined ? {} : { release: record.release }),
    ...(record.bundle === undefined ? {} : { bundle: record.bundle }),
    ...(record.deviceId === undefined ? {} : { deviceId: record.deviceId }),
    ...(record.actorId === undefined ? {} : { actorId: record.actorId }),
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
  };
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

export interface IngestRequest {
  readonly access: LogAccess;
  readonly batch: RuntimeLogBatch;
  readonly source: LogSourceInfo;
  readonly deviceId: string | null;
  readonly now: string;
}

export class RuntimeLogsRepository extends RuntimeLogReads {
  private repairListener: ((record: StoredLogRecord, fingerprint: string) => void) | null = null;

  onRepairEvidence(listener: (record: StoredLogRecord, fingerprint: string) => void): () => void {
    this.repairListener = listener;
    return (): void => {
      if (this.repairListener === listener) this.repairListener = null;
    };
  }

  ingest(request: IngestRequest): RuntimeLogAck {
    const { access, batch, source, deviceId, now } = request;
    if (!access.owner && access.profileId !== source.clientId) {
      throw new LogAccessError();
    }
    const clientId = source.clientId ?? HUB_CLIENT;
    const accepted = this.logWrite(access.owner, batch.records, () => {
      const kept = this.append(
        batch.records
          .map((record) => storedLogOf(asLogRecord(record, source), source, deviceId, now))
          .filter((record) => record !== null),
        clientId,
        access.owner,
      );
      this.touch({ ...source, deviceId, clientId }, now, kept, batch.dropped ?? 0);
      this.recordDroppedRange(source, batch);
      return kept;
    });
    return {
      stored: accepted,
      accepted,
      alreadyStored: batch.records.length - accepted,
      overflowed: (batch.dropped ?? 0) > 0,
    };
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

  append(
    records: readonly StoredLogRecord[],
    clientId: string,
    observe = clientId === HUB_CLIENT,
  ): number {
    return this.logWrite(
      observe,
      records,
      () => records.filter((record) => this.store(record, clientId, observe)).length,
    );
  }

  private logWrite<T>(
    observe: boolean,
    records: readonly Pick<RuntimeLogRecord, 'level'>[],
    work: () => T,
  ): T {
    const groupErrors =
      observe && records.some(({ level }) => level === 'error' || level === 'exception');
    return groupErrors ? this.context.write(work) : this.context.sql.transaction(work);
  }

  private store(record: StoredLogRecord, clientId: string, observe: boolean): boolean {
    const component = componentOf(record.scope, record.source);
    const observation = observe ? repairObservation(record) : null;
    const inserted = this.context.sql.run(
      'store a runtime log record',
      `insert into runtime_logs (at, source, runtime, platform, device_id, client_id, component, level, scope, event, payload, failure, signature, duration_ms, recorded_at, repair_fingerprint, repair_component, release, bundle)
       select $at, $source, $runtime, $platform, $deviceId, $clientId, $component, $level, $scope, $event, $payload, $failure, $signature, $durationMs, $now, $repairFingerprint, $repairComponent, $release, $bundle
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
        repairFingerprint: observation?.fingerprint ?? null,
        repairComponent: observation?.component ?? null,
      },
    );
    if (inserted > 0 && observation !== null) this.offerRepair(record, observation.fingerprint);
    return inserted > 0;
  }

  private offerRepair(record: StoredLogRecord, fingerprint: string): void {
    const listener = this.repairListener;
    if (listener === null) return;
    this.context.afterCommit(() => {
      if (
        this.repairListener === listener &&
        new AiRepairInboxRepository(this.context).mayAutoAdmit(fingerprint)
      )
        listener(record, fingerprint);
    });
  }

  touch(source: LogSourceInfo, at: string, stored: number, dropped: number): void {
    this.context.sql.run(
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
    return this.context.sql.run(
      'record the moments a source could not send',
      `insert into runtime_log_gaps (source, client_id, first_at, last_at, recorded_at)
       values ($source, $clientId, $firstSentAt, $lastSentAt, $recordedAt)
       on conflict (source, first_at, last_at) do nothing`,
      {
        source: source.source,
        clientId: source.clientId ?? HUB_CLIENT,
        firstSentAt,
        lastSentAt,
        recordedAt: this.context.now(),
      },
    );
  }
}
