import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { PLANNER_ITEM_KINDS, PLANNER_LOCAL_DATE } from './items';
import { PLANNER_OCCURRENCE_VIEW } from './range';
import { PLANNER_RING_ROW } from './rings';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_HAPPENED = z
  .strictObject({
    at: MOMENT,
    source: z.string().min(1),
    deviceId: ID.nullable(),
    summary: z.string().min(1),
  })
  .readonly();

export type PlannerHappened = z.infer<typeof PLANNER_HAPPENED>;

export const PLANNER_STRIP_KINDS = ['event', 'task', 'alarm', 'sleep', 'free'] as const;

export const PLANNER_STRIP_SEGMENT = z
  .strictObject({
    kind: z.enum(PLANNER_STRIP_KINDS),
    from: MOMENT,
    to: MOMENT,
    label: z.string().min(1).nullable(),
    collection_id: ID.nullable(),
    item_id: ID.nullable(),
    item_kind: z.enum(PLANNER_ITEM_KINDS).nullable(),
  })
  .refine((segment) => Date.parse(segment.from) <= Date.parse(segment.to), {
    path: ['to'],
    message: 'a segment ends after it starts',
  })
  .readonly();

export type PlannerStripSegment = z.infer<typeof PLANNER_STRIP_SEGMENT>;

export const PLANNER_DAY = z
  .strictObject({
    date: PLANNER_LOCAL_DATE,
    time_zone: TIME_ZONE,
    now: MOMENT,
    missed: z.array(PLANNER_OCCURRENCE_VIEW).readonly(),
    current: z.array(PLANNER_OCCURRENCE_VIEW).readonly(),
    upcoming: z.array(PLANNER_OCCURRENCE_VIEW).readonly(),
    done: z.array(PLANNER_OCCURRENCE_VIEW).readonly(),
    happened: z.array(PLANNER_HAPPENED).readonly(),
    rings: z.array(PLANNER_RING_ROW).readonly(),
    next_alarm_at: MOMENT.nullable(),
    strip: z.array(PLANNER_STRIP_SEGMENT).readonly(),
  })
  .readonly();

export type PlannerDay = z.infer<typeof PLANNER_DAY>;

export const PLANNER_FREE_SLOT = z
  .strictObject({ from: MOMENT, to: MOMENT, minutes: z.int().positive() })
  .readonly();

export type PlannerFreeSlot = z.infer<typeof PLANNER_FREE_SLOT>;
