import { z } from 'zod';
import { PLANNER_ATTACHMENT } from './attachments';
import { PLANNER_COMPLETERS, PLANNER_EVIDENCE, PLANNER_OCCURRENCE_KEY } from './occurrences';
import { PLANNER_GOOGLE_STATES, PLANNER_ITEM_KINDS, PLANNER_LOCAL_DATE } from './items';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_OCCURRENCE_VIEW_STATUSES = [
  'open',
  'done',
  'skipped',
  'missed',
  'cancelled',
  'proposed',
] as const;

export type PlannerOccurrenceViewStatus = (typeof PLANNER_OCCURRENCE_VIEW_STATUSES)[number];

export const PLANNER_OCCURRENCE_VIEW = z
  .strictObject({
    item_id: ID,
    occurrence_key: PLANNER_OCCURRENCE_KEY,
    collection_id: ID,
    kind: z.enum(PLANNER_ITEM_KINDS),
    title: z.string().min(1),
    location: z.string().min(1).nullable(),
    priority: z.int().min(1).max(3).nullable(),
    all_day: z.boolean(),
    start: MOMENT.nullable(),
    end: MOMENT.nullable(),
    due_at: MOMENT.nullable(),
    due_date: PLANNER_LOCAL_DATE.nullable(),
    status: z.enum(PLANNER_OCCURRENCE_VIEW_STATUSES),
    recurring: z.boolean(),
    moved: z.boolean(),
    completed_at: MOMENT.nullable(),
    completed_by: z.enum(PLANNER_COMPLETERS).nullable(),
    evidence: PLANNER_EVIDENCE.nullable(),
    attachments: z.array(PLANNER_ATTACHMENT).readonly(),
    google_state: z.enum(PLANNER_GOOGLE_STATES).nullable(),
  })
  .superRefine((view, context) => {
    if (view.end !== null && view.start === null) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'an end needs a start',
      });
    }
    if (view.evidence !== null && view.status !== 'done') {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'evidence belongs to a done occurrence',
      });
    }
  })
  .readonly();

export type PlannerOccurrenceView = z.infer<typeof PLANNER_OCCURRENCE_VIEW>;

export const PLANNER_RANGE = z
  .strictObject({
    from: MOMENT,
    to: MOMENT,
    occurrences: z.array(PLANNER_OCCURRENCE_VIEW).readonly(),
  })
  .refine((range) => Date.parse(range.from) <= Date.parse(range.to), {
    path: ['to'],
    message: 'the range ends after it starts',
  })
  .readonly();

export type PlannerRange = z.infer<typeof PLANNER_RANGE>;
