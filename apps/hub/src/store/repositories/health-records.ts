import {
  HEALTH_RECORD,
  HEALTH_RECORD_TYPE,
  affectedDays,
  localDayOf,
  type DayAnchor,
  type HealthBatch,
  type HealthDailyRow,
  type HealthIngestResult,
  type HealthMetric,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, moment, type StoreContext } from '../context';
import { dailyFigures } from '../health-daily';
import { jsonText } from '../sql';
import { HealthDaily } from './health-daily-rows';
import type { WatchDaysRepository } from './watch-days';

const RECORD_COLUMNS =
  'record_id, record_type, start_time, end_time, zone_offset_seconds, data, source_app, last_modified';

const STORED_RECORD = z
  .object({
    record_id: z.string(),
    record_type: z.string(),
    start_time: z.string(),
    end_time: z.string().nullable(),
    zone_offset_seconds: z.number().nullable(),
    data: z.string(),
    source_app: z.string(),
    last_modified: z.string(),
  })
  .transform((row) => ({
    recordId: row.record_id,
    type: row.record_type,
    startTime: row.start_time,
    endTime: row.end_time,
    zoneOffsetSeconds: row.zone_offset_seconds,
    data: z.unknown().parse(JSON.parse(row.data)),
    sourceApp: row.source_app,
    lastModified: row.last_modified,
  }))
  .pipe(HEALTH_RECORD);

const DAY_MS = 86_400_000;

function anchorOf(record: HealthRecord): DayAnchor {
  return {
    type: record.type,
    startTime: record.startTime,
    endTime: record.endTime,
    zoneOffsetSeconds: record.zoneOffsetSeconds,
  };
}

export interface OwnRecordsChange {
  readonly profileId: string | null;
  readonly previous: string | null;
  readonly records: readonly HealthRecord[];
  readonly removed: readonly string[];
}

export interface RecordWindow {
  readonly types: readonly HealthRecordType[];
  readonly from: string;
  readonly to: string;
}

export class HealthRecordsRepository {
  private readonly daily: HealthDaily;

  constructor(
    private readonly context: StoreContext,
    private readonly watchDays: WatchDaysRepository,
  ) {
    this.daily = new HealthDaily(context);
  }

  ingest(batch: HealthBatch, profileId: string): HealthIngestResult {
    return this.context.write(() => {
      const anchors: DayAnchor[] = [];
      let stored = 0;
      for (const record of batch.records) {
        const before = this.record(record.recordId, profileId);
        if (
          before !== undefined &&
          Date.parse(before.lastModified) >= Date.parse(record.lastModified)
        ) {
          continue;
        }
        this.save(record, profileId);
        stored += 1;
        anchors.push(anchorOf(record), ...(before === undefined ? [] : [anchorOf(before)]));
      }
      const deleted = batch.deletions.flatMap((recordId) => this.remove(recordId, profileId));
      anchors.push(...deleted.map(anchorOf));
      const days = affectedDays(anchors);
      this.recompute(profileId, days);
      return {
        stored,
        stale: batch.records.length - stored,
        deleted: deleted.length,
        days: [...days],
      };
    });
  }

  replaceOwn(change: OwnRecordsChange): void {
    this.context.write(() => {
      const removed =
        change.previous === null
          ? []
          : change.removed.flatMap((recordId) => this.removeFrom(recordId, change.previous));
      const owner = change.profileId;
      if (owner !== null) {
        for (const record of change.records) {
          this.save(record, owner);
        }
      }
      const days = affectedDays([...removed, ...change.records].map(anchorOf));
      for (const profileId of new Set([change.previous, owner])) {
        if (profileId !== null) {
          this.recompute(profileId, days);
        }
      }
    });
  }

  record(recordId: string, profileId: string): HealthRecord | undefined {
    return this.context.sql.get(
      STORED_RECORD,
      `select ${RECORD_COLUMNS} from health_records
       where record_id = $recordId and profile_id = $profileId and deleted = 0`,
      { recordId, profileId },
    );
  }

  requireRecord(recordId: string, profileId: string): HealthRecord {
    return found(this.record(recordId, profileId), 'health record', recordId);
  }

  records(window: RecordWindow, profileId: string): HealthRecord[] {
    const types = window.types.map((_type, index) => `$type${String(index)}`);
    return this.context.sql.all(
      STORED_RECORD,
      `select ${RECORD_COLUMNS} from health_records
       where deleted = 0 and profile_id = $profileId and record_type in (${types.join(', ')})
         and start_time < $to
         and (end_time >= $from or start_time >= $from)
       order by start_time, record_id`,
      {
        ...Object.fromEntries(window.types.map((type, index) => [`type${String(index)}`, type])),
        from: moment(window.from),
        to: moment(window.to),
        profileId,
      },
    );
  }

  sightings(
    since: string,
    profileId: string,
  ): { sourceApp: string; recordType: HealthRecordType }[] {
    return this.context.sql.all(
      z.object({ source_app: z.string(), record_type: HEALTH_RECORD_TYPE }).transform((row) => ({
        sourceApp: row.source_app,
        recordType: row.record_type,
      })),
      `select distinct source_app, record_type from health_records
       where deleted = 0 and profile_id = $profileId and start_time >= $since
       order by source_app, record_type`,
      { since: moment(since), profileId },
    );
  }

  dailyRange(
    profileId: string,
    from: string,
    to: string,
    metrics: readonly HealthMetric[],
  ): HealthDailyRow[] {
    return this.daily.range(profileId, { from, to, metrics });
  }

  bestDay(
    profileId: string,
    metric: HealthMetric,
    lowest: boolean,
  ): { day: string; value: number } | null {
    return this.daily.best(profileId, metric, lowest);
  }

  recomputeDays(profileId: string, days: readonly string[]): void {
    this.context.write(() => {
      this.recompute(profileId, days);
    });
  }

  private recompute(profileId: string, days: readonly string[]): void {
    for (const day of days) {
      const watch = this.watchDays.figures(profileId, day);
      this.daily.replace(profileId, day, [
        ...dailyFigures(this.recordsOfDay(profileId, day)),
        ...watch,
      ]);
    }
  }

  private recordsOfDay(profileId: string, day: string): HealthRecord[] {
    const start = Date.parse(`${day}T00:00:00.000Z`);
    return this.context.sql
      .all(
        STORED_RECORD,
        `select ${RECORD_COLUMNS} from health_records
         where deleted = 0 and profile_id = $profileId and start_time >= $from and start_time < $to`,
        {
          profileId,
          from: new Date(start - 3 * DAY_MS).toISOString(),
          to: new Date(start + 2 * DAY_MS).toISOString(),
        },
      )
      .filter((record) => localDayOf(anchorOf(record)) === day);
  }

  private save(record: HealthRecord, profileId: string): void {
    this.context.sql.run(
      'save the health record',
      `insert into health_records (record_id, record_type, start_time, end_time, zone_offset_seconds,
         data, source_app, last_modified, deleted, received_at, profile_id)
       values ($recordId, $type, $startTime, $endTime, $zone, $data, $sourceApp, $lastModified, 0, $now,
         $profileId)
       on conflict (record_id) do update set record_type = excluded.record_type,
         start_time = excluded.start_time, end_time = excluded.end_time,
         zone_offset_seconds = excluded.zone_offset_seconds, data = excluded.data,
         source_app = excluded.source_app, last_modified = excluded.last_modified, deleted = 0,
         received_at = excluded.received_at, profile_id = excluded.profile_id`,
      {
        recordId: record.recordId,
        type: record.type,
        startTime: moment(record.startTime),
        endTime: record.endTime === null ? null : moment(record.endTime),
        zone: record.zoneOffsetSeconds,
        data: jsonText(record.data),
        sourceApp: record.sourceApp,
        lastModified: moment(record.lastModified),
        now: this.context.now(),
        profileId,
      },
    );
  }

  private removeFrom(recordId: string, profileId: string | null): HealthRecord[] {
    return profileId === null ? [] : this.remove(recordId, profileId);
  }

  private remove(recordId: string, profileId: string): HealthRecord[] {
    const before = this.record(recordId, profileId);
    if (before === undefined) {
      return [];
    }
    this.context.sql.run(
      'delete the health record',
      'update health_records set deleted = 1 where record_id = $recordId',
      {
        recordId,
      },
    );
    return [before];
  }
}
