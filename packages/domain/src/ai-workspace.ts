import { z } from 'zod';

export const WORKSPACE_CHANGES_RECORD = 'plugin:smarteverything/workspace-changes';
export const WORKSPACE_STATE_RECORD = 'plugin:smarteverything/workspace-state';
export const DELIVERABLES_PRESENTED_EVENT = 'deliverables/presented';

const COUNT = z.int().nonnegative();
const LINE = z.int().min(0);

const RECORD_HUNK = z.strictObject({
  oldStart: LINE,
  oldLines: COUNT,
  newStart: LINE,
  newLines: COUNT,
  lines: z.array(z.string()),
});

const RECORD_DIFF = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    path: z.string().min(1),
    display: z.string().min(1),
    before: z.boolean(),
    after: z.boolean(),
    hunks: z.array(RECORD_HUNK),
    coarse: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('binary'),
    path: z.string().min(1),
    display: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('oversized'),
    path: z.string().min(1),
    display: z.string().min(1),
  }),
]);

const RECORD_FILE = z.strictObject({
  path: z.string().min(1),
  display: z.string().min(1),
  added: COUNT,
  deleted: COUNT,
  binary: z.literal(true).optional(),
  oversized: z.literal(true).optional(),
  diff: RECORD_DIFF.nullable(),
});

export const WORKSPACE_CHANGES_RECORD_DATA = z.strictObject({
  seq: COUNT,
  turn: COUNT,
  cwd: z.string().min(1),
  files: z.array(RECORD_FILE),
  total: COUNT,
  added: COUNT,
  deleted: COUNT,
  snapshot: z.strictObject({ before: z.string().min(1), after: z.string().min(1) }).optional(),
});
export type WorkspaceChangesRecordData = z.infer<typeof WORKSPACE_CHANGES_RECORD_DATA>;

export const WORKSPACE_STATE_RECORD_DATA = z.strictObject({ git: z.enum(['present', 'missing']) });
export type WorkspaceStateRecordData = z.infer<typeof WORKSPACE_STATE_RECORD_DATA>;

export const DELIVERABLES_PRESENTED_DATA = z.strictObject({
  turn: COUNT,
  callId: z.string().min(1),
  files: z.array(z.strictObject({ path: z.string().min(1), description: z.string().optional() })),
});
export type DeliverablesPresentedData = z.infer<typeof DELIVERABLES_PRESENTED_DATA>;

const AI_WORKSPACE_HUNK = z.strictObject({
  old_start: LINE,
  old_lines: COUNT,
  new_start: LINE,
  new_lines: COUNT,
  lines: z.array(z.string()),
});

export const AI_WORKSPACE_DIFF = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    before: z.boolean(),
    after: z.boolean(),
    hunks: z.array(AI_WORKSPACE_HUNK),
    coarse: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('binary') }),
  z.strictObject({ kind: z.literal('oversized') }),
]);
export type AiWorkspaceDiff = z.infer<typeof AI_WORKSPACE_DIFF>;

export const AI_WORKSPACE_FILE = z.strictObject({
  path: z.string().min(1),
  display: z.string().min(1),
  added: COUNT,
  deleted: COUNT,
  binary: z.boolean(),
  oversized: z.boolean(),
  diff: AI_WORKSPACE_DIFF.nullable(),
});
export type AiWorkspaceFile = z.infer<typeof AI_WORKSPACE_FILE>;

export const AI_WORKSPACE_TURN = z.strictObject({
  turn: COUNT,
  cwd: z.string().min(1),
  files: z.array(AI_WORKSPACE_FILE),
  total: COUNT,
  added: COUNT,
  deleted: COUNT,
});
export type AiWorkspaceTurn = z.infer<typeof AI_WORKSPACE_TURN>;

export const AI_WORKSPACE_DELIVERABLE = z.strictObject({
  turn: COUNT,
  call_id: z.string().min(1),
  path: z.string().min(1),
  description: z.string().nullable(),
  attachment_id: z.uuid().nullable(),
});
export type AiWorkspaceDeliverable = z.infer<typeof AI_WORKSPACE_DELIVERABLE>;

export const AI_WORKSPACE_GIT = z.enum(['present', 'missing', 'unknown']);
export type AiWorkspaceGit = z.infer<typeof AI_WORKSPACE_GIT>;

export const AI_WORKSPACE = z.strictObject({
  git: AI_WORKSPACE_GIT,
  turns: z.array(AI_WORKSPACE_TURN),
  deliverables: z.array(AI_WORKSPACE_DELIVERABLE),
});
export type AiWorkspace = z.infer<typeof AI_WORKSPACE>;
