import { z } from 'zod';
import { isRawCapability, isStandardCapability } from '../capabilities';
import { EVENT_KINDS } from '../events';
import { JSON_VALUE } from '../values';

const MOMENT = z.iso.datetime({ offset: true });

const REPORTED_KEY = z.string().refine((key) => isStandardCapability(key) || isRawCapability(key), {
  message: 'not a catalogued capability or a raw:<name> capability',
});

export const NODE_EVENT = z.strictObject({
  kind: z.enum(EVENT_KINDS),
  at: MOMENT,
  details: z.record(z.string(), JSON_VALUE),
});

export type NodeEvent = z.infer<typeof NODE_EVENT>;

export const NODE_SAMPLE = z.strictObject({
  key: REPORTED_KEY,
  value: z.number(),
  at: MOMENT,
});

export type NodeSample = z.infer<typeof NODE_SAMPLE>;

export const NODE_REPORT = z.strictObject({
  at: MOMENT,
  values: z.record(REPORTED_KEY, JSON_VALUE),
  events: z.array(NODE_EVENT),
  metrics: z.array(NODE_SAMPLE).optional(),
});

export type NodeReport = z.infer<typeof NODE_REPORT>;
