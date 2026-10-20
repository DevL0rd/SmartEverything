import { z } from 'zod';
import { MCP_TOOL_AREAS } from './mcp/areas';
import { JSON_VALUE } from './values';

export const CODEX_APPROVAL_POLICY = z.union([
  z.enum(['untrusted', 'on-request', 'never']),
  z.strictObject({
    granular: z.strictObject({
      sandbox_approval: z.boolean(),
      rules: z.boolean(),
      skill_approval: z.boolean(),
      request_permissions: z.boolean(),
      mcp_elicitations: z.boolean(),
    }),
  }),
]);
export const CODEX_SANDBOX_POLICY = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('dangerFullAccess') }),
  z.strictObject({ type: z.literal('readOnly'), networkAccess: z.boolean() }),
  z.strictObject({
    type: z.literal('externalSandbox'),
    networkAccess: z.enum(['restricted', 'enabled']),
  }),
  z.strictObject({
    type: z.literal('workspaceWrite'),
    writableRoots: z.array(z.string().min(1).max(4096)).max(100),
    networkAccess: z.boolean(),
    excludeTmpdirEnvVar: z.boolean(),
    excludeSlashTmp: z.boolean(),
  }),
]);
export const CODEX_PROVIDER_OPTIONS = z.strictObject({
  cwd: z.string().min(1).max(4096).optional(),
  additional_directories: z.array(z.string().min(1).max(4096)).max(100).optional(),
  approval_policy: CODEX_APPROVAL_POLICY.optional(),
  sandbox_policy: CODEX_SANDBOX_POLICY.optional(),
  service_tier: z.string().min(1).max(100).optional(),
  output_schema: z.record(z.string(), JSON_VALUE).optional(),
});
export type CodexProviderOptions = z.infer<typeof CODEX_PROVIDER_OPTIONS>;
const CODEX_CONTROL_FIELDS = {
  enabled: z.boolean(),
  mcp_areas: z.array(z.enum(MCP_TOOL_AREAS)).nullable(),
};
const CODEX_PROVIDER_FIELDS = { enabled: z.boolean(), options: CODEX_PROVIDER_OPTIONS };
export const CODEX_AI_SETTINGS = z.strictObject({
  control: z.strictObject({
    enabled: CODEX_CONTROL_FIELDS.enabled.default(false),
    mcp_areas: CODEX_CONTROL_FIELDS.mcp_areas.default(null),
  }),
  provider: z.strictObject({
    enabled: CODEX_PROVIDER_FIELDS.enabled.default(false),
    options: CODEX_PROVIDER_FIELDS.options,
  }),
});
export type CodexAiSettings = z.infer<typeof CODEX_AI_SETTINGS>;
export const DEFAULT_CODEX_AI_SETTINGS: CodexAiSettings = {
  control: { enabled: false, mcp_areas: null },
  provider: { enabled: false, options: {} },
};
export const CODEX_AI_SETTINGS_PATCH = z
  .strictObject({
    control: z.strictObject(CODEX_CONTROL_FIELDS).partial().optional(),
    provider: z.strictObject(CODEX_PROVIDER_FIELDS).partial().optional(),
  })
  .refine(
    (value) => value.control !== undefined || value.provider !== undefined,
    'Name a setting to change.',
  );
export const CODEX_ID = z.string().min(1).max(200);
export const CODEX_RPC_ID = z.union([z.string().min(1).max(200), z.int()]);
export const CODEX_LIFECYCLE = z.enum([
  'idle',
  'starting',
  'working',
  'waiting_approval',
  'waiting_answer',
  'stopping',
  'completed',
  'interrupted',
  'failed',
  'unknown',
]);
export const CODEX_SESSION = z.strictObject({
  id: CODEX_ID,
  title: z.string().max(500).nullable(),
  cwd: z.string().max(4096).nullable(),
  state: CODEX_LIFECYCLE,
  archived: z.boolean(),
  model: z.string().max(200).nullable(),
  created_at: z.iso.datetime({ offset: true }).nullable(),
  updated_at: z.iso.datetime({ offset: true }).nullable(),
});
export const CODEX_SESSION_PAGE = z.strictObject({
  sessions: z.array(CODEX_SESSION).max(200),
  next_cursor: z.string().max(1000).nullable(),
});
export const CODEX_ITEM = z.strictObject({
  id: CODEX_ID,
  type: z.string().min(1).max(100),
  turn_id: CODEX_ID.nullable(),
  payload: z.record(z.string(), JSON_VALUE),
  unsupported: z.boolean(),
});
export const CODEX_THREAD_PAGE = z.strictObject({
  session_id: CODEX_ID,
  items: z.array(CODEX_ITEM).max(200),
  next_cursor: z.string().max(1000).nullable(),
  truncated: z.boolean(),
});
export const CODEX_USAGE = z.strictObject({
  input_tokens: z.int().nonnegative().nullable(),
  output_tokens: z.int().nonnegative().nullable(),
  total_tokens: z.int().nonnegative().nullable(),
  rate_limits: z.record(z.string(), JSON_VALUE).nullable(),
});
export const CODEX_OPERATION = z.strictObject({
  id: z.uuid(),
  operation: z.string().min(1).max(100),
  state: z.enum(['pending', 'completed', 'failed', 'uncertain']),
  value: JSON_VALUE.nullable(),
  error: z.string().max(2000).nullable(),
});
