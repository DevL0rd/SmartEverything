import { z } from 'zod';
import { COUNT, ID, MOMENT } from './api/primitives';
import { PROVIDER_STATUSES } from './api/rows-home';
import { JSON_VALUE } from './values';

export const GOOGLE_PRODUCTS = ['calendar', 'tasks'] as const;

export const GOOGLE_PRODUCT = z.enum(GOOGLE_PRODUCTS);

export type GoogleProduct = z.infer<typeof GOOGLE_PRODUCT>;

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
] as const;

export const GOOGLE_SCOPE = z.enum(GOOGLE_SCOPES);

export const GOOGLE_PROBLEMS = [
  'invalid_grant',
  'scope_missing',
  'client_missing',
  'network',
  'rate_limited',
  'cancelled',
  'unknown',
] as const;

export const GOOGLE_PROBLEM = z.enum(GOOGLE_PROBLEMS);

export type GoogleProblem = z.infer<typeof GOOGLE_PROBLEM>;

export const GOOGLE_ACCOUNT_ROW = z.strictObject({
  profile_id: ID,
  email: z.email().nullable(),
  scopes: z.array(GOOGLE_SCOPE),
  status: z.enum(PROVIDER_STATUSES),
  problem: GOOGLE_PROBLEM.nullable(),
  calendar_ids: z.array(z.string().min(1)),
  list_ids: z.array(z.string().min(1)),
  last_sync_at: MOMENT.nullable(),
  last_error: z.string().nullable(),
});

export type GoogleAccountRow = z.infer<typeof GOOGLE_ACCOUNT_ROW>;

export const GOOGLE_SYNC_TRIGGERS = [
  'link',
  'manual',
  'visible',
  'push',
  'change',
  'ring',
  'reconcile',
] as const;

export const GOOGLE_SYNC_TRIGGER = z.enum(GOOGLE_SYNC_TRIGGERS);

export type GoogleSyncTrigger = z.infer<typeof GOOGLE_SYNC_TRIGGER>;

export const GOOGLE_SYNC_COUNTS = z.strictObject({
  pulled: COUNT,
  created: COUNT,
  updated: COUNT,
  deleted: COUNT,
  pushed: COUNT,
  conflicts: COUNT,
});

export type GoogleSyncCounts = z.infer<typeof GOOGLE_SYNC_COUNTS>;

export const GOOGLE_CONFLICT_WINNERS = ['app', 'google'] as const;

export const GOOGLE_CONFLICT = z.strictObject({
  item_id: ID,
  field: z.string().min(1),
  winner: z.enum(GOOGLE_CONFLICT_WINNERS),
  losing_value: JSON_VALUE,
});

export type GoogleConflict = z.infer<typeof GOOGLE_CONFLICT>;

export const GOOGLE_CHOICE_CANDIDATE = z.strictObject({
  google_id: z.string().min(1),
  title: z.string(),
  created_at: MOMENT,
});

export const GOOGLE_CHOICE = z
  .strictObject({
    item_id: ID,
    list_id: z.string().min(1),
    candidates: z.array(GOOGLE_CHOICE_CANDIDATE).min(2),
    resolved_google_id: z.string().min(1).nullable(),
    resolved_at: MOMENT.nullable(),
  })
  .refine((choice) => (choice.resolved_google_id === null) === (choice.resolved_at === null), {
    message: 'resolved_google_id and resolved_at are set together',
  })
  .refine(
    (choice) =>
      choice.resolved_google_id === null ||
      choice.candidates.some((candidate) => candidate.google_id === choice.resolved_google_id),
    { message: 'the resolved task must be one of the candidates' },
  );

export type GoogleChoice = z.infer<typeof GOOGLE_CHOICE>;

export const GOOGLE_SYNC_LOG_ENTRY = z.strictObject({
  id: ID,
  profile_id: ID,
  at: MOMENT,
  trigger: GOOGLE_SYNC_TRIGGER,
  product: GOOGLE_PRODUCT.nullable(),
  counts: GOOGLE_SYNC_COUNTS,
  conflicts: z.array(GOOGLE_CONFLICT),
  error: z.string().nullable(),
  choice: GOOGLE_CHOICE.nullable(),
});

export type GoogleSyncLogEntry = z.infer<typeof GOOGLE_SYNC_LOG_ENTRY>;

export const GOOGLE_PUSH_CHANNEL = z.strictObject({
  channel_id: z.string().min(1),
  resource_id: z.string().min(1),
  expires_at: MOMENT,
});

export const GOOGLE_SYNC_STATE = z.strictObject({
  profile_id: ID,
  product: GOOGLE_PRODUCT,
  resource_id: z.string().min(1),
  sync_token: z.string().min(1).nullable(),
  channel: GOOGLE_PUSH_CHANNEL.nullable(),
  last_pull_at: MOMENT.nullable(),
});

export type GoogleSyncState = z.infer<typeof GOOGLE_SYNC_STATE>;
