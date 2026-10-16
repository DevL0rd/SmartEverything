import { z } from 'zod';

export const AUTOMATION_RUNTIME_LIVE_TABLES = [
  'automation_values',
  'automation_runs',
  'automation_sequences',
] as const;
export const AUTOMATION_RUN_HISTORY_LIMIT = 200;
export const MAX_AUTOMATION_QUEUE = 100;
export const MAX_AUTOMATION_PARALLEL = 32;
export const MAX_AUTOMATION_TRACE = 200;
export const AUTOMATION_RUN_ID = z.uuid().brand<'AutomationRunId'>();
export const AUTOMATION_RUN_POLICY = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('single') }),
  z.strictObject({ mode: z.literal('restart') }),
  z.strictObject({ mode: z.literal('queue'), limit: z.int().min(1).max(MAX_AUTOMATION_QUEUE) }),
  z.strictObject({
    mode: z.literal('parallel'),
    limit: z.int().min(1).max(MAX_AUTOMATION_PARALLEL),
  }),
]);
export type AutomationRunPolicy = z.infer<typeof AUTOMATION_RUN_POLICY>;
export const AUTOMATION_RUN_STATUS = z.enum([
  'queued',
  'running',
  'cancelling',
  'cancelled',
  'succeeded',
  'failed',
  'interrupted',
  'ignored',
]);
export type AutomationRunStatus = z.infer<typeof AUTOMATION_RUN_STATUS>;
export const ACTIVE_AUTOMATION_RUN_STATUSES: ReadonlySet<AutomationRunStatus> = new Set([
  'queued',
  'running',
  'cancelling',
]);
export const AUTOMATION_RUN_STEP = z.strictObject({
  nodeId: z.string().min(1).max(200),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  commandIds: z.array(z.uuid()).max(MAX_AUTOMATION_TRACE),
  error: z.string().nullable(),
});
export type AutomationRunStep = z.infer<typeof AUTOMATION_RUN_STEP>;
export const AUTOMATION_RUN_ROW = z.strictObject({
  id: AUTOMATION_RUN_ID,
  automation_id: z.uuid(),
  target_type: z.enum(['automation', 'sequence']).optional(),
  definition_revision: z.string().min(1).max(100),
  owner_profile_id: z.uuid().nullable(),
  authority_ids: z.array(z.uuid()),
  control_key: z.string().trim().min(1).max(100).nullable(),
  parent_run_id: AUTOMATION_RUN_ID.nullable(),
  status: AUTOMATION_RUN_STATUS,
  current_node: z.string().nullable(),
  trace: z.array(AUTOMATION_RUN_STEP).max(MAX_AUTOMATION_TRACE),
  error: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
});
export type AutomationRunRow = z.infer<typeof AUTOMATION_RUN_ROW>;
