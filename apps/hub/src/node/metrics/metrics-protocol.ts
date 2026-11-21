import { LOG_LEVELS } from '@smarteverything/logging';
import {
  HISTORY_COLUMNS,
  HISTORY_POLICY,
  HISTORY_QUERY,
  LOG_RECORD,
  NODE_DEMAND_TOPICS,
  NODE_HELLO,
  PROCESS_WINDOW,
  SAMPLE_TOPICS,
  type NodeSampleFrame,
} from '@smarteverything/domain';
import { z } from 'zod';

export const METRICS_WORKER_DATA = z.strictObject({
  machineId: z.string().min(1),
  level: z.enum(LOG_LEVELS),
  policy: HISTORY_POLICY,
});

export type MetricsWorkerData = z.input<typeof METRICS_WORKER_DATA>;

const ID = z.int().nonnegative();

export const TO_METRICS = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('demand'), owner: z.string(), topics: NODE_DEMAND_TOPICS }),
  z.strictObject({ type: z.literal('release'), owner: z.string() }),
  z.strictObject({ type: z.literal('poke'), topic: z.enum(SAMPLE_TOPICS) }),
  z.strictObject({ type: z.literal('policy'), policy: HISTORY_POLICY }),
  z.strictObject({ type: z.literal('track'), policy: HISTORY_POLICY.nullable() }),
  z.strictObject({ type: z.literal('watch'), window: PROCESS_WINDOW.nullable() }),
  z.strictObject({ type: z.literal('hello'), id: ID, now: z.iso.datetime() }),
  z.strictObject({ type: z.literal('backfill'), id: ID, query: HISTORY_QUERY }),
  z.strictObject({ type: z.literal('close') }),
]);

export type ToMetrics = z.input<typeof TO_METRICS>;

const SAMPLE_FRAME = z.custom<NodeSampleFrame>(
  (value) => typeof value === 'object' && value !== null && Reflect.get(value, 'type') === 'sample',
  'a sample frame',
);

export const FROM_METRICS = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('frame'), frame: SAMPLE_FRAME }),
  z.strictObject({ type: z.literal('log'), record: LOG_RECORD }),
  z.strictObject({ type: z.literal('hello'), id: ID, hello: NODE_HELLO }),
  z.strictObject({ type: z.literal('backfill'), id: ID, columns: HISTORY_COLUMNS }),
  z.strictObject({ type: z.literal('failed'), id: ID, message: z.string() }),
]);

export type FromMetrics = z.input<typeof FROM_METRICS> | z.output<typeof FROM_METRICS>;
