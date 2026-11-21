import { HEALTH_DAILY_ROW, type HealthDailyRow, type HealthMetric } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import type { DailyFigure } from '../health-daily';
import { inList } from '../sql';

const COLUMNS = 'profile_id, day, metric, value, unit, updated_at';

export interface DailyWindow {
  readonly from: string;
  readonly to: string;
  readonly metrics: readonly HealthMetric[];
}

const BEST = z.object({ day: z.string(), value: z.number() });

export class HealthDaily {
  constructor(private readonly context: StoreContext) {}

  range(profileId: string, window: DailyWindow): HealthDailyRow[] {
    const { from, to, metrics } = window;
    const filter = inList('metric', 'metrics', metrics);
    return this.context.sql.all(
      HEALTH_DAILY_ROW,
      `select ${COLUMNS} from health_daily
       where profile_id = $profileId and day >= $from and day <= $to and ${filter.text}
       order by day, metric`,
      { profileId, from, to, ...filter.parameters },
    );
  }

  best(
    profileId: string,
    metric: HealthMetric,
    lowest: boolean,
  ): { day: string; value: number } | null {
    const direction = lowest ? 'asc' : 'desc';
    return (
      this.context.sql.get(
        BEST,
        `select day, value from health_daily where profile_id = $profileId and metric = $metric
         order by value ${direction}, day desc limit 1`,
        { profileId, metric },
      ) ?? null
    );
  }

  replace(profileId: string, day: string, figures: readonly DailyFigure[]): void {
    const before = new Map(this.ofDay(profileId, day).map((row) => [row.metric, row]));
    const changed = figures.filter((figure) => {
      const previous = before.get(figure.metric);
      return previous?.value !== figure.value || previous.unit !== figure.unit;
    });
    const kept = new Set(figures.map((figure) => figure.metric));
    const removed = [...before.values()].filter((row) => !kept.has(row.metric));
    const now = this.context.now();
    for (const figure of changed) {
      this.context.sql.run(
        'save the daily figure',
        `insert into health_daily (profile_id, day, metric, value, unit, updated_at)
         values ($profileId, $day, $metric, $value, $unit, $now)
         on conflict (profile_id, day, metric) do update set value = excluded.value,
           unit = excluded.unit, updated_at = excluded.updated_at`,
        { profileId, day, metric: figure.metric, value: figure.value, unit: figure.unit, now },
      );
    }
    for (const row of removed) {
      this.context.sql.run(
        'remove the daily figure',
        'delete from health_daily where profile_id = $profileId and day = $day and metric = $metric',
        { profileId, day, metric: row.metric },
      );
    }
    if (changed.length > 0) {
      const metrics = new Set(changed.map((figure) => figure.metric));
      for (const after of this.ofDay(profileId, day)) {
        if (!metrics.has(after.metric)) continue;
        const previous = before.get(after.metric) ?? null;
        this.context.changed(
          'health_daily',
          previous === null ? 'INSERT' : 'UPDATE',
          after,
          previous,
        );
      }
    }
    for (const row of removed) {
      this.context.changed('health_daily', 'DELETE', null, row);
    }
  }

  private ofDay(profileId: string, day: string): HealthDailyRow[] {
    return this.context.sql.all(
      HEALTH_DAILY_ROW,
      `select ${COLUMNS} from health_daily where profile_id = $profileId and day = $day order by metric`,
      { profileId, day },
    );
  }
}
