import { z } from 'zod';
import type { HealthMetric } from '@smarteverything/domain';
import { SERIES } from './catalogue';
import type { SeriesSpec } from './series-spec';

export type DailySpec = SeriesSpec & { readonly daily: HealthMetric };

function isDaily(spec: SeriesSpec): spec is DailySpec {
  return spec.daily !== null;
}

const DAILY_SERIES: readonly DailySpec[] = SERIES.filter(isDaily);

class UnknownDailySeriesError extends Error {
  override readonly name = 'UnknownDailySeriesError';

  constructor(readonly key: string) {
    super(`${key} has no daily figure to show in a widget.`);
  }
}

export function dailySeries(key: string): DailySpec {
  const found = DAILY_SERIES.find((spec) => spec.key === key);
  if (found === undefined) {
    throw new UnknownDailySeriesError(key);
  }
  return found;
}

const METRIC_KEY = z
  .string()
  .refine((key) => DAILY_SERIES.some((spec) => spec.key === key), 'a metric with daily figures');

export const METRIC_OPTIONS = z.strictObject({ metric: METRIC_KEY });

export type MetricOptions = z.infer<typeof METRIC_OPTIONS>;

const TREND_RANGES = ['week', 'month'] as const;

export const TREND_OPTIONS = z.strictObject({ metric: METRIC_KEY, range: z.enum(TREND_RANGES) });

export type TrendOptions = z.infer<typeof TREND_OPTIONS>;

export const METRIC_PICKS = DAILY_SERIES.map((spec) => ({ value: spec.key, label: spec.label }));
