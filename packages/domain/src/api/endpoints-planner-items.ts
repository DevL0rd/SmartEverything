import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { PLANNER_ATTACHMENT } from '../planner/attachments';
import { PLANNER_REMINDERS } from '../planner/collections';
import { PLANNER_COMPLETION } from '../planner/completion';
import { PLANNER_FREE_SLOT } from '../planner/day';
import {
  PLANNER_ITEM_KINDS,
  PLANNER_ITEM_ROW,
  PLANNER_LOCAL_DATE,
  PLANNER_LOCAL_DATETIME,
} from '../planner/items';
import {
  PLANNER_EVIDENCE,
  PLANNER_OCCURRENCE_KEY,
  PLANNER_OCCURRENCE_ROW,
} from '../planner/occurrences';
import { SIGNAL_MATCHER } from '../signal-matcher';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, somethingToChange } from './primitives';

export const PLANNER_PERSON_QUERY = z.strictObject({ personId: ID.optional() });

const LOCAL_MOMENT = z.union([PLANNER_LOCAL_DATE, PLANNER_LOCAL_DATETIME]);

const ITEM_FIELDS = {
  collection_id: ID,
  kind: z.enum(PLANNER_ITEM_KINDS),
  parent_id: ID.nullable(),
  title: z.string().trim().min(1),
  notes: z.string(),
  location: z.string().trim().min(1).nullable(),
  priority: z.int().min(1).max(3).nullable(),
  tags: z.array(z.string().trim().min(1)),
  estimate_minutes: z.int().positive().nullable(),
  start_local: LOCAL_MOMENT.nullable(),
  end_local: LOCAL_MOMENT.nullable(),
  time_zone: TIME_ZONE.nullable(),
  all_day: z.boolean(),
  due_date: PLANNER_LOCAL_DATE.nullable(),
  due_at: MOMENT.nullable(),
  rrule: z.string().trim().min(1).nullable(),
  exdates: z.array(LOCAL_MOMENT),
  position: z.number(),
  completion: PLANNER_COMPLETION,
  attachments: z.array(PLANNER_ATTACHMENT),
  reminders: PLANNER_REMINDERS,
} as const;

export const PLANNER_ITEM_CREATE = z.strictObject({
  collection_id: ITEM_FIELDS.collection_id,
  kind: ITEM_FIELDS.kind,
  title: ITEM_FIELDS.title,
  parent_id: ITEM_FIELDS.parent_id.default(null),
  notes: ITEM_FIELDS.notes.default(''),
  location: ITEM_FIELDS.location.default(null),
  priority: ITEM_FIELDS.priority.default(null),
  tags: ITEM_FIELDS.tags.default([]),
  estimate_minutes: ITEM_FIELDS.estimate_minutes.default(null),
  start_local: ITEM_FIELDS.start_local.default(null),
  end_local: ITEM_FIELDS.end_local.default(null),
  time_zone: ITEM_FIELDS.time_zone.default(null),
  all_day: ITEM_FIELDS.all_day.default(false),
  due_date: ITEM_FIELDS.due_date.default(null),
  due_at: ITEM_FIELDS.due_at.default(null),
  rrule: ITEM_FIELDS.rrule.default(null),
  exdates: ITEM_FIELDS.exdates.default([]),
  position: ITEM_FIELDS.position.optional(),
  completion: ITEM_FIELDS.completion.default({ kind: 'manual' }),
  attachments: ITEM_FIELDS.attachments.default([]),
  reminders: ITEM_FIELDS.reminders.default([]),
});

export type PlannerItemCreate = z.infer<typeof PLANNER_ITEM_CREATE>;

export const PLANNER_ITEM_CHANGES = somethingToChange(ITEM_FIELDS);

export const PLANNER_ITEM_SCOPES = ['this', 'following', 'all'] as const;

export type PlannerItemScope = (typeof PLANNER_ITEM_SCOPES)[number];

function needsOccurrence(
  value: { readonly scope: PlannerItemScope; readonly occurrence_key?: unknown },
  context: z.RefinementCtx,
): void {
  if (value.scope !== 'all' && value.occurrence_key === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['occurrence_key'],
      message: 'this and following name the occurrence they start at',
    });
  }
}

export const PLANNER_ITEM_PATCH = z
  .strictObject({
    scope: z.enum(PLANNER_ITEM_SCOPES).default('all'),
    occurrence_key: PLANNER_OCCURRENCE_KEY.optional(),
    changes: PLANNER_ITEM_CHANGES,
  })
  .superRefine(needsOccurrence);

export const PLANNER_ITEM_DELETE_QUERY = z
  .strictObject({
    personId: ID.optional(),
    scope: z.enum(PLANNER_ITEM_SCOPES).default('all'),
    occurrence_key: PLANNER_OCCURRENCE_KEY.optional(),
  })
  .superRefine(needsOccurrence);

const ITEM_PARAMS = z.strictObject({ itemId: ID });

const OCCURRENCE_BODY = z.strictObject({
  occurrence_key: PLANNER_OCCURRENCE_KEY.default('single'),
});

export const PLANNER_COMPLETE_BODY = z.strictObject({
  occurrence_key: PLANNER_OCCURRENCE_KEY.default('single'),
  evidence: PLANNER_EVIDENCE.optional(),
});

export const PLANNER_MOVE_BODY = z
  .strictObject({
    occurrence_key: PLANNER_OCCURRENCE_KEY.default('single'),
    start: MOMENT,
    end: MOMENT.nullable().default(null),
  })
  .refine((move) => move.end === null || Date.parse(move.end) >= Date.parse(move.start), {
    path: ['end'],
    message: 'the end is not before the start',
  });

export const PLANNER_PARSE_BODY = z.strictObject({
  text: z.string().trim().min(1),
  collection_id: ID.optional(),
  time_zone: TIME_ZONE.optional(),
});

export const PLANNER_PARSE_RESULT = z.strictObject({
  draft: PLANNER_ITEM_CREATE,
  next_occurrences: z.array(MOMENT),
  repeat_text: z.string().min(1).nullable(),
});

export const PLANNER_SUGGEST_BODY = z.strictObject({
  title: z.string().trim().min(1),
  notes: z.string().default(''),
  attachments: z.array(PLANNER_ATTACHMENT).default([]),
});

export const PLANNER_COMPLETION_SUGGESTION = z.strictObject({
  label: z.string().min(1),
  completion: PLANNER_COMPLETION,
  matcher: SIGNAL_MATCHER.nullable(),
});

export const PLANNER_FREE_SLOTS_BODY = z
  .strictObject({
    from: MOMENT,
    to: MOMENT,
    minutes: z.int().positive(),
  })
  .refine((body) => Date.parse(body.from) < Date.parse(body.to), {
    path: ['to'],
    message: 'the window ends after it starts',
  });

const PROPOSAL_PARAMS = z.strictObject({ id: ID });

export const PLANNER_ITEM_ENDPOINTS = {
  createPlannerItem: endpoint({
    method: 'POST',
    path: '/api/planner/items',
    access: 'member',
    summary: 'Add a task or event to a calendar or list',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_ITEM_CREATE,
    response: PLANNER_ITEM_ROW,
  }),
  updatePlannerItem: endpoint({
    method: 'PATCH',
    path: '/api/planner/items/:itemId',
    access: 'member',
    summary:
      'Change an item; for a repeating item scope says whether the change applies to this occurrence, this and the following ones, or the whole series',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_ITEM_PATCH,
    response: PLANNER_ITEM_ROW,
  }),
  deletePlannerItem: endpoint({
    method: 'DELETE',
    path: '/api/planner/items/:itemId',
    access: 'member',
    summary: 'Delete an item, one occurrence, or this and the following occurrences of a series',
    params: ITEM_PARAMS,
    query: PLANNER_ITEM_DELETE_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  completePlannerItem: endpoint({
    method: 'POST',
    path: '/api/planner/items/:itemId/complete',
    access: 'member',
    summary: 'Mark an occurrence done, with the evidence when a device or the AI did it',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_COMPLETE_BODY,
    response: PLANNER_OCCURRENCE_ROW,
  }),
  skipPlannerItem: endpoint({
    method: 'POST',
    path: '/api/planner/items/:itemId/skip',
    access: 'member',
    summary: 'Skip an occurrence without doing it',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: OCCURRENCE_BODY,
    response: PLANNER_OCCURRENCE_ROW,
  }),
  movePlannerItem: endpoint({
    method: 'POST',
    path: '/api/planner/items/:itemId/move',
    access: 'member',
    summary: 'Move one occurrence to a later time (Later)',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_MOVE_BODY,
    response: PLANNER_OCCURRENCE_ROW,
  }),
  parsePlannerText: endpoint({
    method: 'POST',
    path: '/api/planner/parse',
    access: 'member',
    summary: 'Read quick-add text into an item draft and the next occurrences it would have',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_PARSE_BODY,
    response: PLANNER_PARSE_RESULT,
  }),
  suggestPlannerCompletion: endpoint({
    method: 'POST',
    path: '/api/planner/suggest-completion',
    access: 'member',
    summary: 'Suggest how a task could finish by itself from device signals',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_SUGGEST_BODY,
    response: z.array(PLANNER_COMPLETION_SUGGESTION),
  }),
  plannerFreeSlots: endpoint({
    method: 'POST',
    path: '/api/planner/free-slots',
    access: 'member',
    summary: 'Free stretches of at least the asked length between events in a window',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_FREE_SLOTS_BODY,
    response: z.array(PLANNER_FREE_SLOT),
  }),
  acceptPlannerProposal: endpoint({
    method: 'POST',
    path: '/api/planner/proposals/:id/accept',
    access: 'member',
    summary: 'Accept an item the AI proposed; it becomes an open item',
    params: PROPOSAL_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_ITEM_ROW,
  }),
  rejectPlannerProposal: endpoint({
    method: 'POST',
    path: '/api/planner/proposals/:id/reject',
    access: 'member',
    summary: 'Reject an item the AI proposed',
    params: PROPOSAL_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
