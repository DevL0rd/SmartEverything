import { z } from 'zod';

export const METRIC_RANGES = ['10m', '24h', '30d'] as const;

export type MetricRange = (typeof METRIC_RANGES)[number];

export const METRIC_RESOLUTIONS = ['second', 'minute', 'hour'] as const;

export type MetricResolution = (typeof METRIC_RESOLUTIONS)[number];

export const METRIC_RANGE_RESOLUTION: Readonly<Record<MetricRange, MetricResolution>> = {
  '10m': 'second',
  '24h': 'minute',
  '30d': 'hour',
};

export const METRIC_POINT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  value: z.number(),
  minimum: z.number(),
  maximum: z.number(),
});

export type MetricPoint = z.infer<typeof METRIC_POINT>;

export const METRIC_SERIES = z.strictObject({
  resolution: z.enum(METRIC_RESOLUTIONS),
  points: z.array(METRIC_POINT),
});

export type MetricSeries = z.infer<typeof METRIC_SERIES>;
