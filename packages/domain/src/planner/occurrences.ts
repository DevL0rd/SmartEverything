import { z } from 'zod';
import { PLANNER_LOCAL_DATE } from './items';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_OCCURRENCE_SINGLE = 'single';

export const PLANNER_OCCURRENCE_STATUSES = ['done', 'skipped', 'missed'] as const;

export const PLANNER_COMPLETERS = ['person', 'signal', 'ai', 'google'] as const;

export const PLANNER_OCCURRENCE_KEY = z.union([
  z.literal(PLANNER_OCCURRENCE_SINGLE),
  MOMENT,
  PLANNER_LOCAL_DATE,
]);

export const PLANNER_EVIDENCE = z
  .strictObject({
    source: z.string().min(1),
    deviceId: ID.nullable(),
    summary: z.string().min(1),
    sessionId: z.string().min(1).nullable(),
  })
  .readonly();

export type PlannerEvidence = z.infer<typeof PLANNER_EVIDENCE>;

export const PLANNER_OCCURRENCE_ROW = z
  .strictObject({
    item_id: ID,
    occurrence_key: PLANNER_OCCURRENCE_KEY,
    status: z.enum(PLANNER_OCCURRENCE_STATUSES),
    completed_at: MOMENT.nullable(),
    completed_by: z.enum(PLANNER_COMPLETERS).nullable(),
    evidence: PLANNER_EVIDENCE.nullable(),
    moved_start: MOMENT.nullable(),
    moved_end: MOMENT.nullable(),
  })
  .superRefine((row, context) => {
    const done = row.status === 'done';
    if (done !== (row.completed_at !== null) || done !== (row.completed_by !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['completed_at'],
        message: 'only a done occurrence has a completion time and a completer',
      });
    }
    if (row.evidence !== null && !done) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'evidence belongs to a done occurrence',
      });
    }
    if (row.moved_end !== null && row.moved_start === null) {
      context.addIssue({
        code: 'custom',
        path: ['moved_end'],
        message: 'a moved end needs a moved start',
      });
    }
  })
  .readonly();

export type PlannerOccurrenceRow = z.infer<typeof PLANNER_OCCURRENCE_ROW>;
