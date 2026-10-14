import { z } from 'zod';
import {
  AI_HARNESS_COMPOSITION,
  AI_HARNESS_TARGET,
  AI_HARNESS_TARGET_WRITE,
  type AiHarnessComposition,
} from './ai-harness';
import { JSON_VALUE } from './values';
import { dshCoreEventIssues } from './dsh-session-event-data';

export const DSH_SESSION_ID = z.string().min(1).max(200).brand('DshSessionId');
const OFFSET = z
  .int()
  .nonnegative()
  .refine((value) => !Object.is(value, -0), 'A native log position must not be negative zero.');
export const DSH_SESSION_HEADER = z
  .object({
    version: z.literal(4),
    id: DSH_SESSION_ID,
    createdAt: OFFSET,
    cwd: z.string().min(1).max(4096).optional(),
    parentSession: DSH_SESSION_ID.optional(),
    isSeeded: z.boolean(),
    origin: z.literal('subagent').optional(),
    delegationDepth: OFFSET.optional(),
    agentPreset: z.string().min(1).max(200).optional(),
  })
  .catchall(JSON_VALUE)
  .refine(
    (value) => !Object.hasOwn(value, 'seedLength'),
    'The native header seedLength field is retired.',
  );
export const DSH_SESSION_EVENT = z
  .object({
    type: z.string().min(1).max(200),
    seq: OFFSET,
    time: OFFSET,
    data: JSON_VALUE,
    ignorable: z.literal(true).optional(),
    surfaceOp: JSON_VALUE.optional(),
    sourceEventSeqs: JSON_VALUE.optional(),
  })
  .catchall(JSON_VALUE);
export const DSH_SESSION_EVENTS = z.array(DSH_SESSION_EVENT);
export const DSH_SESSION_EVENT_WRITE = DSH_SESSION_EVENT.strict().superRefine((event, context) => {
  for (const issue of dshCoreEventIssues(event))
    context.addIssue({ ...issue, path: ['data', ...issue.path] });
});
export const DSH_SESSION_EVENTS_WRITE = z.array(DSH_SESSION_EVENT_WRITE);
const COMPOSITION_REFUSAL = 'The native session store requires DSH 0.2.1-alpha.2 session format 4.';
function currentComposition(value: AiHarnessComposition): boolean {
  return value.dsh_version === '0.2.1-alpha.2' && value.session_format === 4;
}
export const DSH_SESSION_COMPOSITION = AI_HARNESS_COMPOSITION.refine(
  currentComposition,
  COMPOSITION_REFUSAL,
);
export const DSH_SESSION_COMPOSITION_WRITE = AI_HARNESS_COMPOSITION.strict().refine(
  currentComposition,
  COMPOSITION_REFUSAL,
);
export const DSH_SESSION_METADATA = z.object({
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  header: DSH_SESSION_HEADER,
  composition: DSH_SESSION_COMPOSITION,
  inherited_event_count: OFFSET,
  next_seq: OFFSET,
  durable_seq: z.int().min(-1),
});
export const DSH_WRITER_CLAIM = z.object({
  session_id: DSH_SESSION_ID,
  target: AI_HARNESS_TARGET,
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  token: z.uuid(),
  epoch: z.int().positive(),
  expires_at: z.iso.datetime({ offset: true }),
});
export const DSH_WRITER_CLAIM_WRITE = z.strictObject({
  ...DSH_WRITER_CLAIM.shape,
  target: AI_HARNESS_TARGET_WRITE,
});
const WRITER_REQUEST = z.strictObject({
  target: AI_HARNESS_TARGET_WRITE,
  runtime_instance: z.uuid(),
  connection_generation: z.uuid(),
  operation_id: z.uuid(),
  lease_ms: z.int().min(1000).max(120_000),
});
export const DSH_SESSION_CREATE = WRITER_REQUEST.extend({
  chat_id: z.uuid(),
  header: DSH_SESSION_HEADER,
  composition: DSH_SESSION_COMPOSITION_WRITE,
  inherited_event_count: OFFSET,
}).refine(
  (value) => value.header.isSeeded || value.inherited_event_count === 0,
  'An unseeded session must have an inherited event count of zero.',
);
export const DSH_SESSION_ACQUIRE = WRITER_REQUEST.extend({ session_id: DSH_SESSION_ID });
export const DSH_SESSION_APPEND = z.strictObject({
  claim: DSH_WRITER_CLAIM_WRITE,
  operation_id: z.uuid(),
  events: DSH_SESSION_EVENTS_WRITE,
});
export const DSH_SESSION_FLUSH = z.strictObject({
  claim: DSH_WRITER_CLAIM_WRITE,
  expected_next_seq: OFFSET,
});
export const DSH_SESSION_RELEASE = DSH_SESSION_FLUSH.extend({ operation_id: z.uuid() });
export const DSH_SESSION_RENEW = z.strictObject({
  claim: DSH_WRITER_CLAIM_WRITE,
  lease_ms: z.int().min(1000).max(120_000),
});
export const DSH_SESSION_READ = z.strictObject({
  session_id: DSH_SESSION_ID,
  offset: OFFSET.optional(),
  limit: z.int().min(1).max(10_000).optional(),
});
export const DSH_SESSION_PAGE = z.object({
  metadata: DSH_SESSION_METADATA,
  events: DSH_SESSION_EVENTS,
  next_offset: OFFSET.nullable(),
});
export const DSH_SESSION_WORKSPACE = z.strictObject({
  claim: DSH_WRITER_CLAIM_WRITE,
  cwd: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/),
});
export const DSH_SESSION_WORKSPACE_CHOICE = z.object({
  target: AI_HARNESS_TARGET,
  cwd: DSH_SESSION_WORKSPACE.shape.cwd,
  updated_at: z.iso.datetime({ offset: true }),
});
export type DshSessionId = z.infer<typeof DSH_SESSION_ID>;
export type DshSessionHeader = z.infer<typeof DSH_SESSION_HEADER>;
export type DshSessionComposition = z.infer<typeof DSH_SESSION_COMPOSITION>;
export type DshSessionEvent = z.infer<typeof DSH_SESSION_EVENT_WRITE>;
export type DshSessionMetadata = z.infer<typeof DSH_SESSION_METADATA>;
export type DshWriterClaim = z.infer<typeof DSH_WRITER_CLAIM>;
export type DshSessionCreate = z.infer<typeof DSH_SESSION_CREATE>;
export type DshSessionAcquire = z.infer<typeof DSH_SESSION_ACQUIRE>;
export type DshSessionAppend = z.infer<typeof DSH_SESSION_APPEND>;
export type DshSessionFlush = z.infer<typeof DSH_SESSION_FLUSH>;
export type DshSessionRelease = z.infer<typeof DSH_SESSION_RELEASE>;
export type DshSessionRenew = z.infer<typeof DSH_SESSION_RENEW>;
export type DshSessionRead = z.infer<typeof DSH_SESSION_READ>;
export type DshSessionPage = z.infer<typeof DSH_SESSION_PAGE>;
export type DshSessionWorkspace = z.infer<typeof DSH_SESSION_WORKSPACE>;
export type DshSessionWorkspaceChoice = z.infer<typeof DSH_SESSION_WORKSPACE_CHOICE>;
