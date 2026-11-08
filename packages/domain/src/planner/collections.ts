import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_COLOUR_KEYS = [
  'work',
  'family',
  'personal',
  'health',
  'home',
  'shopping',
] as const;

export type PlannerColourKey = (typeof PLANNER_COLOUR_KEYS)[number];

export const PLANNER_COLOUR = z.enum(PLANNER_COLOUR_KEYS);

export const PLANNER_REMINDER = z
  .strictObject({ minutes_before: z.int().nonnegative() })
  .readonly();

export type PlannerReminder = z.infer<typeof PLANNER_REMINDER>;

export const PLANNER_REMINDERS = z.array(PLANNER_REMINDER).readonly();

export const PLANNER_COLLECTION_KINDS = ['calendar', 'list'] as const;

export const PLANNER_COLLECTION_SOURCES = ['local', 'google'] as const;

export const PLANNER_COLLECTION_GOOGLE = z
  .strictObject({
    id: z.string().min(1),
    etag: z.string().min(1).nullable(),
    syncToken: z.string().min(1).nullable(),
  })
  .readonly();

export const PLANNER_COLLECTION_ROW = z
  .strictObject({
    id: ID,
    profile_id: ID,
    kind: z.enum(PLANNER_COLLECTION_KINDS),
    name: z.string().trim().min(1),
    colour: PLANNER_COLOUR,
    icon: z.string().trim().min(1),
    position: z.number(),
    visible: z.boolean(),
    default_reminders: PLANNER_REMINDERS,
    source: z.enum(PLANNER_COLLECTION_SOURCES),
    google: PLANNER_COLLECTION_GOOGLE.nullable(),
    created_at: MOMENT,
    updated_at: MOMENT,
  })
  .superRefine((row, context) => {
    if ((row.source === 'google') !== (row.google !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['google'],
        message: 'a Google collection carries its Google link and a local one carries none',
      });
    }
  })
  .readonly();

export type PlannerCollectionRow = z.infer<typeof PLANNER_COLLECTION_ROW>;
