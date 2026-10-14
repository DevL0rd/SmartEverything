import { z } from 'zod';
export const PROMPT_SCOPE = z.object({
  threadId: z.string().min(1),
  turnId: z.string().nullable().optional(),
  itemId: z.string().optional(),
});
export const APPROVAL_DECISION = z.union([
  z.enum(['accept', 'acceptForSession', 'decline', 'cancel']),
  z.object({
    acceptWithExecpolicyAmendment: z.object({ execpolicy_amendment: z.array(z.string()) }),
  }),
  z.object({
    applyNetworkPolicyAmendment: z.object({
      network_policy_amendment: z.object({ host: z.string(), action: z.enum(['allow', 'deny']) }),
    }),
  }),
]);
export const COMMAND_APPROVAL = PROMPT_SCOPE.extend({
  turnId: z.string(),
  itemId: z.string(),
  startedAtMs: z.number(),
  availableDecisions: z.array(APPROVAL_DECISION).nullable().optional(),
  command: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
});
export const FILE_APPROVAL = PROMPT_SCOPE.extend({
  turnId: z.string(),
  itemId: z.string(),
  startedAtMs: z.number(),
});
export const INPUT_QUESTION = z.object({
  id: z.string(),
  header: z.string(),
  question: z.string(),
  isOther: z.boolean(),
  isSecret: z.boolean(),
  options: z.array(z.object({ label: z.string(), description: z.string() })).nullable(),
});
const FILE_PATH = z.discriminatedUnion('type', [
  z.object({ type: z.literal('path'), path: z.string() }),
  z.object({ type: z.literal('glob_pattern'), pattern: z.string() }),
  z.object({
    type: z.literal('special'),
    value: z.discriminatedUnion('kind', [
      z.object({ kind: z.enum(['root', 'minimal', 'tmpdir', 'slash_tmp']) }),
      z.object({ kind: z.literal('project_roots'), subpath: z.string().nullable() }),
      z.object({ kind: z.literal('unknown'), path: z.string(), subpath: z.string().nullable() }),
    ]),
  }),
]);
export const REQUEST_PERMISSIONS = z.object({
  network: z.object({ enabled: z.boolean().nullable() }).nullable(),
  fileSystem: z
    .object({
      read: z.array(z.string()).nullable(),
      write: z.array(z.string()).nullable(),
      globScanMaxDepth: z.int().optional(),
      entries: z
        .array(z.object({ path: FILE_PATH, access: z.enum(['read', 'write', 'deny']) }))
        .optional(),
    })
    .nullable(),
});
export const PERMISSION_APPROVAL = PROMPT_SCOPE.extend({
  turnId: z.string(),
  itemId: z.string(),
  environmentId: z.string().nullable(),
  startedAtMs: z.number(),
  cwd: z.string(),
  reason: z.string().nullable(),
  permissions: REQUEST_PERMISSIONS,
});
export const USER_INPUT = PROMPT_SCOPE.extend({
  turnId: z.string(),
  itemId: z.string(),
  questions: z.array(INPUT_QUESTION),
  isBlocking: z.boolean(),
  autoResolutionMs: z.number().nullable(),
});
