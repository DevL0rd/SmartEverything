import {
  appendTo,
  HEALTH_METRIC_UNITS,
  WATCH_DAY_ROW,
  type HealthMetric,
  type WatchDayRow,
  type WatchSample,
  type WatchSampleBatch,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import type { DailyFigure } from '../health-daily';
import { SQL_JSON, jsonText } from '../sql';

const STORED_DAY = z
  .object({
    profile_id: z.string(),
    device_id: z.string(),
    day: z.string(),
    kind: z.string(),
    samples: SQL_JSON,
    updated_at: z.string(),
  })
  .pipe(WATCH_DAY_ROW);

const COLUMNS = 'profile_id, device_id, day, kind, samples, updated_at';

export interface WatchSampleOwner {
  readonly profileId: string;
  readonly deviceId: string;
}

function localDay(time: string, zoneOffsetSeconds: number): string {
  return new Date(Date.parse(time) + zoneOffsetSeconds * 1000).toISOString().slice(0, 10);
}

function merged(existing: readonly WatchSample[], incoming: readonly WatchSample[]): WatchSample[] {
  const byTime = new Map(existing.map((sample) => [Date.parse(sample.time), sample]));
  for (const sample of incoming) {
    byTime.set(Date.parse(sample.time), {
      time: new Date(sample.time).toISOString(),
      value: sample.value,
    });
  }
  return [...byTime.entries()].sort(([left], [right]) => left - right).map(([, sample]) => sample);
}

function figure(metric: HealthMetric, value: number): DailyFigure {
  return { metric, value, unit: HEALTH_METRIC_UNITS[metric] };
}

function figuresOf(row: WatchDayRow): DailyFigure[] {
  const last = row.samples.at(-1);
  if (last === undefined) {
    return [];
  }
  if (row.kind === 'vitality') {
    return [figure('vitality', last.value)];
  }
  const values = row.samples.map((sample) => sample.value);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return [
    figure('stress_average', Math.round(average)),
    figure('stress_maximum', Math.max(...values)),
  ];
}

export class WatchDaysRepository {
  constructor(private readonly context: StoreContext) {}

  save(owner: WatchSampleOwner, batch: WatchSampleBatch): string[] {
    const groups = new Map<string, WatchSample[]>();
    for (const sample of batch.samples) {
      const day = localDay(sample.time, batch.zoneOffsetSeconds);
      appendTo(groups, day, sample);
    }
    return this.context.write(() =>
      [...groups.entries()].map(([day, samples]) => {
        this.merge(owner, day, batch.kind, samples);
        return day;
      }),
    );
  }

  window(profileId: string, from: string, to: string): WatchDayRow[] {
    return this.context.sql.all(
      STORED_DAY,
      `select ${COLUMNS} from watch_days
       where profile_id = $profileId and day >= $from and day <= $to order by day, kind`,
      { profileId, from, to },
    );
  }

  figures(profileId: string, day: string): DailyFigure[] {
    return this.window(profileId, day, day).flatMap(figuresOf);
  }

  private find(owner: WatchSampleOwner, day: string, kind: string): WatchDayRow | undefined {
    return this.context.sql.get(
      STORED_DAY,
      `select ${COLUMNS} from watch_days
       where profile_id = $profileId and device_id = $deviceId and day = $day and kind = $kind`,
      { profileId: owner.profileId, deviceId: owner.deviceId, day, kind },
    );
  }

  private merge(
    owner: WatchSampleOwner,
    day: string,
    kind: WatchDayRow['kind'],
    samples: readonly WatchSample[],
  ): void {
    const before = this.find(owner, day, kind) ?? null;
    const row: WatchDayRow = {
      profile_id: owner.profileId,
      device_id: owner.deviceId,
      day,
      kind,
      samples: merged(before?.samples ?? [], samples),
      updated_at: this.context.now(),
    };
    this.context.sql.run(
      'save the watch day',
      `insert into watch_days (${COLUMNS}) values ($profileId, $deviceId, $day, $kind, $samples, $now)
       on conflict (profile_id, device_id, day, kind) do update set samples = excluded.samples,
         updated_at = excluded.updated_at`,
      {
        profileId: row.profile_id,
        deviceId: row.device_id,
        day,
        kind,
        samples: jsonText(row.samples),
        now: row.updated_at,
      },
    );
    this.context.changed('watch_days', before === null ? 'INSERT' : 'UPDATE', row, before);
  }
}
