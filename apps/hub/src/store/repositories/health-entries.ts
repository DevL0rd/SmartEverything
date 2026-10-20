import {
  HEALTH_ENTRY_ROW,
  LOGGABLE_TYPE,
  clientRecordIdOf,
  entryRefOfClientRecordId,
  entryRecordRefs,
  entryRecords,
  type EntrySourceRef,
  type HealthEntryInput,
  type HealthEntryRow,
  type LoggableType,
  type OutboxEntry,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { inList, jsonText } from '../sql';
import { EntryFailures } from './health-entry-failures';
import type { HealthRecordsRepository } from './health-records';

const STORED_ENTRY = storedRow(HEALTH_ENTRY_ROW, { json: ['data', 'food'] });

const COLUMNS = `e.id, e.profile_id, e.record_type, e.start_time, e.end_time, e.zone_offset_seconds,
  e.data, e.food, e.source, e.version,
  (select f.reason from health_entry_failures f where f.entry_id = e.id and f.version >= e.version
    order by f.failed_at desc limit 1) as save_error,
  e.created_at, e.updated_at`;

const OUTBOX_LIMIT = 200;

const REMOVAL = z.object({ id: z.string(), record_type: LOGGABLE_TYPE, version: z.number() });

const ENTRY_ID = z.object({ id: z.string() });

const REMAINING = z.object({ writes: z.number() });

export interface EntryWindow {
  readonly from: string;
  readonly to: string;
  readonly types?: readonly LoggableType[] | undefined;
}

function inputValues(input: HealthEntryInput): Record<string, string | number | null> {
  return {
    record_type: input.type,
    start_time: moment(input.startTime),
    end_time: input.endTime === null ? null : moment(input.endTime),
    zone_offset_seconds: input.zoneOffsetSeconds,
    data: jsonText(input.data),
    food: input.food === null ? null : jsonText(input.food),
  };
}

function writesOf(row: HealthEntryRow): OutboxEntry['records'] {
  const present = new Map(entryRecords(row).map((record) => [record.recordId, record]));
  return entryRecordRefs(row).flatMap((ref) => {
    const record = present.get(ref.recordId) ?? null;
    if (record === null && row.version === 1) {
      return [];
    }
    return [{ type: ref.type, clientRecordId: clientRecordIdOf(ref.recordId), record }];
  });
}

export class HealthEntriesRepository {
  private readonly failures: EntryFailures;

  constructor(
    private readonly context: StoreContext,
    private readonly health: HealthRecordsRepository,
  ) {
    this.failures = new EntryFailures(context);
  }

  window(profileId: string, window: EntryWindow): HealthEntryRow[] {
    const types = window.types ?? [];
    const typed = types.length === 0 ? undefined : inList('record_type', 'types', types);
    return this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from health_entries e
       where profile_id = $profileId and deleted_at is null and start_time < $to
         and coalesce(end_time, start_time) >= $from${typed === undefined ? '' : ` and ${typed.text}`}
       order by start_time, id`,
      {
        profileId,
        from: moment(window.from),
        to: moment(window.to),
        ...typed?.parameters,
      },
    );
  }

  byId(id: string, profileId: string): HealthEntryRow {
    return found(
      this.context.sql.get(
        STORED_ENTRY,
        `select ${COLUMNS} from health_entries e
         where id = $id and profile_id = $profileId and deleted_at is null`,
        { id, profileId },
      ),
      'health entry',
      id,
    );
  }

  idBySource(profileId: string, source: EntrySourceRef): string | undefined {
    return this.context.sql.get(
      ENTRY_ID,
      'select id from health_entries where profile_id = $profileId and source_key = $sourceKey',
      { profileId, sourceKey: source.key },
    )?.id;
  }

  create(
    profileId: string,
    input: HealthEntryInput,
    source: EntrySourceRef | null = null,
  ): HealthEntryRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'log the health entry',
        `insert into health_entries (id, profile_id, record_type, start_time, end_time,
           zone_offset_seconds, data, food, source, source_key, version, created_at, updated_at)
         values ($id, $profileId, $record_type, $start_time, $end_time, $zone_offset_seconds, $data,
           $food, $source, $sourceKey, 1, $now, $now)`,
        {
          id,
          profileId,
          now,
          source: source?.source ?? null,
          sourceKey: source?.key ?? null,
          ...inputValues(input),
        },
      );
      const row = this.byId(id, profileId);
      this.health.replaceOwn({
        profileId,
        previous: null,
        records: entryRecords(row),
        removed: [],
      });
      this.context.changed('health_entries', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, input: HealthEntryInput): HealthEntryRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run(
        'change the health entry',
        `update health_entries set record_type = $record_type, start_time = $start_time,
           end_time = $end_time, zone_offset_seconds = $zone_offset_seconds, data = $data,
           food = $food, version = version + 1, updated_at = $now
         where id = $id`,
        { id, now: this.context.now(), ...inputValues(input) },
      );
      const after = this.byId(id, profileId);
      const records = entryRecords(after);
      const kept = new Set(records.map((record) => record.recordId));
      this.health.replaceOwn({
        profileId,
        previous: profileId,
        records,
        removed: entryRecordRefs(before)
          .map((ref) => ref.recordId)
          .filter((recordId) => !kept.has(recordId)),
      });
      this.context.changed('health_entries', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run(
        'delete the health entry',
        `update health_entries set deleted_at = $now, version = version + 1, updated_at = $now
         where id = $id`,
        { id, now: this.context.now() },
      );
      this.health.replaceOwn({
        profileId,
        previous: profileId,
        records: [],
        removed: entryRecordRefs(before).map((ref) => ref.recordId),
      });
      this.purgeIfUnwritten(id);
      this.context.changed('health_entries', 'DELETE', null, before);
    });
  }

  outbox(profileId: string, sourceId: string): OutboxEntry[] {
    const writes = this.context.sql
      .all(
        STORED_ENTRY,
        `select ${COLUMNS} from health_entries e
         where e.profile_id = $profileId and e.deleted_at is null
           and not exists (select 1 from health_entry_writes w
             where w.entry_id = e.id and w.source_id = $sourceId and w.version >= e.version)
         order by e.start_time limit $limit`,
        { profileId, sourceId, limit: OUTBOX_LIMIT },
      )
      .map((row) => ({ id: row.id, version: row.version, records: writesOf(row) }))
      .filter((entry) => entry.records.length > 0);
    return [...writes, ...this.removals(profileId, sourceId)];
  }

  written(sourceId: string, id: string, version: number): void {
    this.context.write(() => {
      const deleted = this.context.sql.get(
        REMOVAL,
        'select id, record_type, version from health_entries where id = $id and deleted_at is not null',
        { id },
      );
      if (deleted !== undefined) {
        this.failures.clear(id, sourceId);
        this.context.sql.run(
          'forget the Health Connect write',
          'delete from health_entry_writes where entry_id = $id and source_id = $sourceId',
          { id, sourceId },
        );
        this.purgeIfUnwritten(id);
        return;
      }
      this.context.sql.run(
        'note the Health Connect write',
        `insert into health_entry_writes (entry_id, source_id, version, written_at)
         values ($id, $sourceId, $version, $now)
         on conflict (entry_id, source_id) do update set version = excluded.version,
           written_at = excluded.written_at`,
        { id, sourceId, version, now: this.context.now() },
      );
      if (this.failures.clear(id, sourceId)) {
        this.publishChange(id);
      }
    });
  }

  failed(sourceId: string, id: string, version: number, reason: string): void {
    this.context.write(() => {
      const before = this.live(id);
      if (this.failures.record(sourceId, id, version, reason) && before !== undefined) {
        this.context.changed('health_entries', 'UPDATE', this.byId(id, before.profile_id), before);
      }
    });
  }

  retry(id: string, profileId: string): HealthEntryRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      this.failures.clear(id, null);
      const after = this.byId(id, profileId);
      this.context.changed('health_entries', 'UPDATE', after, before);
      return after;
    });
  }

  removedInHealthConnect(profileId: string, sourceId: string, clientRecordId: string): void {
    const ref = entryRefOfClientRecordId(clientRecordId);
    const entry = this.live(ref.entryId);
    if (entry?.profile_id !== profileId) {
      return;
    }
    this.context.write(() => {
      if (ref.type === entry.record_type) {
        this.context.sql.run(
          'forget the removed Health Connect write',
          'delete from health_entry_writes where entry_id = $id and source_id = $sourceId',
          { id: entry.id, sourceId },
        );
        this.remove(entry.id, profileId);
        return;
      }
      if (entry.food !== null) {
        this.update(entry.id, profileId, {
          type: entry.record_type,
          startTime: entry.start_time,
          endTime: entry.end_time,
          zoneOffsetSeconds: entry.zone_offset_seconds,
          data: entry.data,
          food: { ...entry.food, waterMl: 0 },
        });
      }
    });
  }

  isOwnedBy(id: string, profileId: string): boolean {
    return (
      this.context.sql.get(
        z.object({ id: z.string() }),
        'select id from health_entries where id = $id and profile_id = $profileId',
        { id, profileId },
      ) !== undefined
    );
  }

  private live(id: string): HealthEntryRow | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from health_entries e where id = $id and deleted_at is null`,
      { id },
    );
  }

  private publishChange(id: string): void {
    const after = this.live(id);
    if (after !== undefined) {
      this.context.changed('health_entries', 'UPDATE', after, after);
    }
  }

  private removals(profileId: string, sourceId: string): OutboxEntry[] {
    return this.context.sql
      .all(
        REMOVAL,
        `select e.id, e.record_type, e.version from health_entries e
         join health_entry_writes w on w.entry_id = e.id and w.source_id = $sourceId
         where e.profile_id = $profileId and e.deleted_at is not null
         order by e.deleted_at limit $limit`,
        { profileId, sourceId, limit: OUTBOX_LIMIT },
      )
      .map((row) => ({
        id: row.id,
        version: row.version,
        records: entryRecordRefs(row).map((ref) => ({
          type: ref.type,
          clientRecordId: clientRecordIdOf(ref.recordId),
          record: null,
        })),
      }));
  }

  private purgeIfUnwritten(id: string): void {
    const remaining = this.context.sql.get(
      REMAINING,
      'select count(*) as writes from health_entry_writes where entry_id = $id',
      { id },
    );
    if (found(remaining, 'write count of the health entry', id).writes === 0) {
      this.context.sql.run(
        'purge the deleted health entry',
        'delete from health_entries where id = $id and deleted_at is not null',
        { id },
      );
    }
  }
}
