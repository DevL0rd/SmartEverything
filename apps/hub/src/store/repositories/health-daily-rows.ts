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
    this.context.sql.run(
      'clear the daily figures',
      'delete from health_daily where profile_id = $profileId and day = $day',
      { profileId, day },
    );
    const now = this.context.now();
    for (const figure of figures) {
      this.context.sql.run(
        'save the daily figure',
        `insert into health_daily (profile_id, day, metric, value, unit, updated_at)
         values ($profileId, $day, $metric, $value, $unit, $now)`,
        { profileId, day, metric: figure.metric, value: figure.value, unit: figure.unit, now },
      );
    }
    for (const after of this.ofDay(profileId, day)) {
      const previous = before.get(after.metric) ?? null;
      before.delete(after.metric);
      this.context.changed(
        'health_daily',
        previous === null ? 'INSERT' : 'UPDATE',
        after,
        previous,
      );
    }
    for (const removed of before.values()) {
      this.context.changed('health_daily', 'DELETE', null, removed);
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
