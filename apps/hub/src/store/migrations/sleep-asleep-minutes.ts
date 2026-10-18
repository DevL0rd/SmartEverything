import {
  HEALTH_RECORD,
  asleepMinutes,
  localDayOf,
  type HealthRecord,
} from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { fromPreferredSource } from '../health-sources-priority';
import type { Sql } from '../sql';

const DAY_MS = 86_400_000;

const SLEEP_DAY = z.object({ profile_id: z.string(), day: z.string() });

const SESSION = z
  .object({
    record_id: z.string(),
    start_time: z.string(),
    end_time: z.string().nullable(),
    zone_offset_seconds: z.number().nullable(),
    data: z.string(),
    source_app: z.string(),
    last_modified: z.string(),
  })
  .transform((row) => ({
    recordId: row.record_id,
    type: 'SleepSession',
    startTime: row.start_time,
    endTime: row.end_time,
    zoneOffsetSeconds: row.zone_offset_seconds,
    data: z.unknown().parse(JSON.parse(row.data)),
    sourceApp: row.source_app,
    lastModified: row.last_modified,
  }))
  .pipe(HEALTH_RECORD);

function sessionsEndingOn(sql: Sql, profileId: string, day: string): HealthRecord[] {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return sql
    .all(
      SESSION,
      `select record_id, start_time, end_time, zone_offset_seconds, data, source_app, last_modified
       from health_records
       where deleted = 0 and profile_id = $profileId and record_type = 'SleepSession'
         and start_time >= $from and start_time < $to`,
      {
        profileId,
        from: new Date(start - 3 * DAY_MS).toISOString(),
        to: new Date(start + 2 * DAY_MS).toISOString(),
      },
    )
    .filter((record) => localDayOf(record) === day);
}

export function recomputeSleepFigures(sql: Sql): LogPayload {
  const days = sql.all(
    SLEEP_DAY,
    "select profile_id, day from health_daily where metric = 'sleep'",
  );
  for (const { profile_id: profileId, day } of days) {
    const sessions = fromPreferredSource(sessionsEndingOn(sql, profileId, day)).flatMap((record) =>
      record.type === 'SleepSession' ? [record] : [],
    );
    sql.run(
      'recompute the daily sleep figure',
      `update health_daily set value = $value
       where profile_id = $profileId and day = $day and metric = 'sleep'`,
      {
        profileId,
        day,
        value: sessions.reduce((total, session) => total + asleepMinutes(session), 0),
      },
    );
  }
  return { sleepDays: days.length };
}
