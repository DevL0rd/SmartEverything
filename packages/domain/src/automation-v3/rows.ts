import { z } from 'zod';
import { AUTOMATION_NAME, AUTOMATION_AUTHOR } from '../api/rows-media';
import { COUNT, FLAG, ID, JSON_LIST, JSON_OBJECT, MOMENT } from '../api/primitives';
import { AUTOMATION_RUN_ID } from '../automation-runs';
import { PLUGIN_ORIGIN } from '../plugin-people';
import { FLOW_ERROR } from './errors';
import { LAYOUT } from './layout';
import { AUTOMATION_V3, FUNCTION_V3 } from './program';

const HASH = z.string().regex(/^[0-9a-f]{64}$/, 'a hash is 64 lowercase hex digits');

export const PLAN_HASH = HASH;
export const INTERFACE_HASH = HASH;

export const AUTOMATION_DRAFT = z.strictObject({
  program: AUTOMATION_V3,
  layout: LAYOUT,
});

export const FUNCTION_DRAFT = z.strictObject({
  program: FUNCTION_V3,
  layout: LAYOUT,
});

export const AUTOMATION_ROW_V3 = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  enabled: FLAG,
  revision: z.int().positive(),
  definition: AUTOMATION_V3,
  draft: AUTOMATION_DRAFT.nullable(),
  layout: LAYOUT,
  origin: PLUGIN_ORIGIN.nullable(),
  author: AUTOMATION_AUTHOR.nullable(),
  last_run_at: MOMENT.nullable(),
  last_error: z.string().nullable(),
  run_count: COUNT,
  created_at: MOMENT,
  updated_at: MOMENT,
});

export const AUTOMATION_REVISION_ROW = z.strictObject({
  automation_id: ID,
  revision: z.int().positive(),
  definition: AUTOMATION_V3,
  layout: LAYOUT,
  plan_hash: PLAN_HASH,
  saved_at: MOMENT,
  author: AUTOMATION_AUTHOR.nullable(),
});

export const FUNCTION_COMPAT = z.enum(['compatible', 'breaking']);

export const FUNCTION_ROW = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  description: z.string().nullable(),
  category: z.string().nullable(),
  icon: z.string().nullable(),
  latest_revision: z.int().positive(),
  created_by: ID.nullable(),
  author: AUTOMATION_AUTHOR.nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
  draft: FUNCTION_DRAFT.nullable(),
});

export const FUNCTION_REVISION_ROW = z.strictObject({
  function_id: ID,
  revision: z.int().positive(),
  definition: FUNCTION_V3,
  layout: LAYOUT,
  interface_hash: INTERFACE_HASH,
  compat: FUNCTION_COMPAT,
  plan_hash: PLAN_HASH,
  saved_at: MOMENT,
  author: AUTOMATION_AUTHOR.nullable(),
});

export const RUN_RECORD_MODES = ['live', 'dry', 'simulated'] as const;

export const RUN_RECORD_MODE = z.enum(RUN_RECORD_MODES);

export const RUN_RECORD_STATUS = z.enum([
  'queued',
  'running',
  'waiting',
  'paused',
  'cancelling',
  'cancelled',
  'succeeded',
  'failed',
  'interrupted',
  'ignored',
]);

export type RunRecordStatus = z.infer<typeof RUN_RECORD_STATUS>;
export type RunRecordMode = z.infer<typeof RUN_RECORD_MODE>;

export const ACTIVE_RUN_RECORD_STATUSES: ReadonlySet<RunRecordStatus> = new Set([
  'queued',
  'running',
  'waiting',
  'paused',
  'cancelling',
]);

export const RUN_CAUSE = z.strictObject({
  automation_id: ID,
  run_id: AUTOMATION_RUN_ID,
});

export const PLAN_REF = z.strictObject({
  function_id: ID,
  revision: z.int().positive(),
});

const RUN_SUMMARY_SHAPE = {
  id: AUTOMATION_RUN_ID,
  automation_id: ID,
  revision: z.int().positive(),
  owner_profile_id: ID.nullable(),
  control_key: z.string().trim().min(1).max(100).nullable(),
  parent_run_id: AUTOMATION_RUN_ID.nullable(),
  status: RUN_RECORD_STATUS,
  mode: RUN_RECORD_MODE,
  plan_hash: PLAN_HASH,
  current_node: z.string().nullable(),
  started_by: z.string().nullable(),
  steps: COUNT,
  commands: COUNT,
  iterations: COUNT,
  active_paths: z.array(z.string()),
  wake_at: MOMENT.nullable(),
  error: z.string().nullable(),
  created_at: MOMENT,
  started_at: MOMENT.nullable(),
  finished_at: MOMENT.nullable(),
} as const;

const RUN_RECORD_ONLY_SHAPE = {
  state: JSON_OBJECT.nullable(),
  trigger: JSON_OBJECT.nullable(),
  cause_chain: z.array(RUN_CAUSE),
  waiting_on: JSON_OBJECT.nullable(),
  plan_refs: z.array(PLAN_REF),
} as const;

export const AUTOMATION_RUN_SUMMARY = z.strictObject(RUN_SUMMARY_SHAPE);

export const AUTOMATION_RUN_RECORD = z.strictObject({
  ...RUN_SUMMARY_SHAPE,
  ...RUN_RECORD_ONLY_SHAPE,
});

export const RUN_RECORD_ONLY_FIELDS = Object.keys(RUN_RECORD_ONLY_SHAPE);

export type AutomationRunSummary = z.infer<typeof AUTOMATION_RUN_SUMMARY>;
export type AutomationRunRecord = z.infer<typeof AUTOMATION_RUN_RECORD>;

export function summaryOf(record: AutomationRunRecord): AutomationRunSummary {
  return AUTOMATION_RUN_SUMMARY.parse(
    Object.fromEntries(Object.entries(record).filter(([key]) => key in RUN_SUMMARY_SHAPE)),
  );
}

export const RUN_NODE_STATUS = z.enum([
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);

export const RUN_NODE_RECORD = z.strictObject({
  run_id: AUTOMATION_RUN_ID,
  seq: COUNT,
  path: z.string().min(1),
  node_id: ID,
  iteration: COUNT,
  status: RUN_NODE_STATUS,
  started_at: MOMENT.nullable(),
  finished_at: MOMENT.nullable(),
  duration_ms: COUNT.nullable(),
  input_preview: JSON_OBJECT.nullable(),
  output_preview: JSON_OBJECT.nullable(),
  truncated: FLAG,
  error: FLOW_ERROR.nullable(),
  command_ids: z.array(ID),
  late: FLAG,
});

export const DECISION_REASONS = [
  'admit_false',
  'single_busy',
  'queue_full',
  'parallel_full',
  'stale',
  'storm',
  'feedback',
] as const;

export const DECISION_REASON = z.enum(DECISION_REASONS);

export const AUTOMATION_DECISION = z.strictObject({
  automation_id: ID,
  window_start: MOMENT,
  reason: DECISION_REASON,
  count: z.int().min(1),
  first_at: MOMENT,
  last_at: MOMENT,
  detail: JSON_OBJECT.nullable(),
});

export const STORED_TEST = z.strictObject({
  automation_id: ID,
  id: ID,
  name: z.string().trim().min(1).max(120),
  scenario: JSON_OBJECT,
  expectations: JSON_LIST,
  updated_at: MOMENT,
});

export type AutomationRowV3 = z.infer<typeof AUTOMATION_ROW_V3>;
export type AutomationRevisionRow = z.infer<typeof AUTOMATION_REVISION_ROW>;
export type FunctionRow = z.infer<typeof FUNCTION_ROW>;
export type FunctionRevisionRow = z.infer<typeof FUNCTION_REVISION_ROW>;
export type RunNodeRecord = z.infer<typeof RUN_NODE_RECORD>;
export type AutomationDecision = z.infer<typeof AUTOMATION_DECISION>;
export type StoredTest = z.infer<typeof STORED_TEST>;
