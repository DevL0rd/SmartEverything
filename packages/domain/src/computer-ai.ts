import { z } from 'zod';
import { MCP_TOOL_AREAS } from './mcp/areas';
import { JSON_VALUE } from './values';
import { CLAUDE_PERMISSION_MODE } from './claude';

export const NATIVE_MANAGED_PROJECT = z.object({
  protocol: z.literal(1),
  chat_id: z.uuid(),
});
export type NativeManagedProject = z.infer<typeof NATIVE_MANAGED_PROJECT>;

export const COMPUTER_AI_NATIVE_TOOL = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  input_schema: z.record(z.string(), JSON_VALUE).nullable(),
  reason: z.string().max(500).nullable(),
});

export type ComputerAiNativeTool = z.infer<typeof COMPUTER_AI_NATIVE_TOOL>;

export const COMPUTER_AI_SETTING_VALUE = z.union([z.string().max(4096), z.boolean(), z.number()]);
export const COMPUTER_NATIVE_MCP_POLICY = z.strictObject({
  enabled: z.boolean(),
  areas: z.array(z.enum(MCP_TOOL_AREAS)).nullable(),
});
export type ComputerNativeMcpPolicy = z.infer<typeof COMPUTER_NATIVE_MCP_POLICY>;

const MCP_POLICY = z.strictObject({
  name: z.string().min(1).max(200),
  permission_policy: z.enum(['always_allow', 'always_ask', 'always_deny']).optional(),
  org_max_permission: z.enum(['allow', 'ask', 'blocked']).optional(),
});
const MCP_COMMON = {
  timeout: z.int().min(1000).max(3_600_000).optional(),
  alwaysLoad: z.boolean().optional(),
};
const MCP_REMOTE = {
  ...MCP_COMMON,
  url: z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  headers: z.record(z.string().min(1).max(200), z.string().max(16_000)).optional(),
  tools: z.array(MCP_POLICY).max(500).optional(),
};
export const CLAUDE_MCP_SERVER = z.discriminatedUnion('type', [
  z.strictObject({
    ...MCP_COMMON,
    type: z.literal('stdio'),
    command: z.string().min(1).max(4096),
    args: z.array(z.string().max(16_000)).max(200).optional(),
    env: z.record(z.string().min(1).max(200), z.string().max(16_000)).optional(),
  }),
  z.strictObject({ ...MCP_REMOTE, type: z.literal('http') }),
  z.strictObject({ ...MCP_REMOTE, type: z.literal('sse') }),
]);
export const CLAUDE_MCP_SERVERS = z
  .record(
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .refine((name) => name !== 'home', 'The home bridge is protected.'),
    CLAUDE_MCP_SERVER,
  )
  .refine(
    (servers) => Object.keys(servers).length <= 100,
    'At most 100 MCP servers are supported.',
  );
export type ClaudeMcpServers = z.infer<typeof CLAUDE_MCP_SERVERS>;

export const CLAUDE_PROVIDER_OPTIONS = z.strictObject({
  flag_settings: z.record(z.string().min(1).max(100), JSON_VALUE).optional(),
  mcp_servers: CLAUDE_MCP_SERVERS.optional(),
  agent: z.string().min(1).max(200).optional(),
  resume_session_at: z.uuid().optional(),
  persist_session: z.boolean().optional(),
  prompt_suggestions: z.boolean().optional(),
  agent_progress_summaries: z.boolean().optional(),
  max_budget_usd: z.number().positive().optional(),
  permission_prompts: z.enum(['host', 'none']).optional(),
  cwd: z.string().min(1).max(4096).optional(),
  permission_mode: CLAUDE_PERMISSION_MODE.exclude(['unknown']).optional(),
  thinking: z.enum(['adaptive', 'enabled', 'disabled']).optional(),
  thinking_budget: z.int().positive().optional(),
  fast: z.boolean().optional(),
  setting_sources: z.array(z.enum(['user', 'project', 'local'])).optional(),
  builtin_tools: z.array(z.string().min(1).max(200)).max(500).default([]),
  additional_directories: z.array(z.string().min(1).max(4096)).max(100).optional(),
  plugins: z
    .array(z.strictObject({ type: z.literal('local'), path: z.string().min(1).max(4096) }))
    .max(100)
    .optional(),
  agents: z
    .record(
      z.string().min(1).max(100),
      z.strictObject({
        description: z.string().min(1).max(4000),
        prompt: z.string().min(1).max(100_000),
        tools: z.array(z.string().min(1).max(200)).optional(),
        model: z.string().min(1).max(200).optional(),
        disallowedTools: z.array(z.string().min(1).max(200)).max(500).optional(),
        mcpServers: z
          .array(z.union([z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), CLAUDE_MCP_SERVERS]))
          .max(100)
          .optional(),
        criticalSystemReminder_EXPERIMENTAL: z.string().max(100_000).optional(),
        skills: z.array(z.string().min(1).max(200)).max(500).optional(),
        initialPrompt: z.string().max(100_000).optional(),
        maxTurns: z.int().min(1).max(10_000).optional(),
        autoCompactWindow: z.int().positive().optional(),
        background: z.boolean().optional(),
        omitClaudeMd: z.boolean().optional(),
        memory: z.enum(['user', 'project', 'local']).optional(),
        effort: z
          .union([z.enum(['low', 'medium', 'high', 'xhigh', 'max']), z.int().nonnegative()])
          .optional(),
        permissionMode: CLAUDE_PERMISSION_MODE.exclude(['unknown']).optional(),
        observer: z.string().min(1).max(200).optional(),
        observerMessage: z.string().max(100_000).optional(),
      }),
    )
    .optional(),
  output_format: z
    .strictObject({ type: z.literal('json_schema'), schema: z.record(z.string(), JSON_VALUE) })
    .optional(),
  max_turns: z.int().min(1).max(10_000).optional(),
  title: z.string().min(1).max(500).optional(),
  fork_session: z.boolean().optional(),
  thinking_display: z.enum(['summarized', 'omitted']).optional(),
});
export type ClaudeProviderOptions = z.infer<typeof CLAUDE_PROVIDER_OPTIONS>;

export const COMPUTER_AI_SETTINGS = z.strictObject({
  control: z.strictObject({
    enabled: z.boolean(),
    auto_link: z.boolean(),
    mcp_areas: z.array(z.enum(MCP_TOOL_AREAS)).nullable().default(null),
  }),
  provider: z.strictObject({ enabled: z.boolean(), options: CLAUDE_PROVIDER_OPTIONS }),
});
export type ComputerAiSettings = z.infer<typeof COMPUTER_AI_SETTINGS>;
export const DEFAULT_COMPUTER_AI_SETTINGS: ComputerAiSettings = {
  control: { enabled: false, auto_link: false, mcp_areas: null },
  provider: { enabled: false, options: { builtin_tools: [] } },
};
export const COMPUTER_AI_SETTINGS_PATCH = z
  .strictObject({
    control: COMPUTER_AI_SETTINGS.shape.control.partial().optional(),
    provider: COMPUTER_AI_SETTINGS.shape.provider.partial().optional(),
  })
  .refine(
    (value) => value.control !== undefined || value.provider !== undefined,
    'Name a setting to change.',
  );
export type ComputerAiSettingsPatch = z.infer<typeof COMPUTER_AI_SETTINGS_PATCH>;

const REASON = z.string().min(1).max(500).nullable();
export const COMPUTER_AI_SETTING = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('boolean'), key: z.string().min(1), label: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('enum'),
    key: z.string().min(1),
    label: z.string().min(1),
    values: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    kind: z.literal('integer'),
    key: z.string().min(1),
    label: z.string().min(1),
    minimum: z.int(),
    maximum: z.int(),
  }),
]);
export const COMPUTER_AI_OPERATIONS = [
  'status',
  'native_operation',
  'native_tools_list',
  'native_tools_call',
  'models',
  'sessions',
  'session',
  'thread',
  'usage',
  'prompts',
  'control',
  'start',
  'install_link',
  'remove_link',
  'register_controller',
  'remove_controller',
  'answer',
  'configure',
  'provider_metadata',
  'provider_read',
  'provider_control',
  'provider_start',
  'provider_tool_result',
  'provider_interrupt',
  'provider_answer',
] as const;
export const COMPUTER_AI_CAPABILITIES = z.strictObject({
  managed_projects: z.object({ protocol: z.literal(1) }).optional(),
  runtime_version: z.string().min(1).max(100).nullable(),
  operations: z.array(z.enum(COMPUTER_AI_OPERATIONS)),
  settings: z.array(COMPUTER_AI_SETTING),
  control_reason: REASON,
  provider_reason: REASON,
});
export type ComputerAiCapabilities = z.infer<typeof COMPUTER_AI_CAPABILITIES>;
export const COMPUTER_AI_MODEL = z.strictObject({
  device_id: z.uuid(),
  id: z.string().min(1).max(200),
  resolved_model: z.string().min(1).max(200).nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  efforts: z.array(z.string().min(1).max(32)),
  adaptive_thinking: z.boolean(),
  fast: z.boolean(),
  available: z.boolean(),
  reason: REASON,
});
export type ComputerAiModel = z.infer<typeof COMPUTER_AI_MODEL>;
export const COMPUTER_AI_STATUS = z.strictObject({
  device_id: z.uuid(),
  local: z.boolean(),
  online: z.boolean(),
  settings: COMPUTER_AI_SETTINGS,
  capabilities: COMPUTER_AI_CAPABILITIES,
});
export type ComputerAiStatus = z.infer<typeof COMPUTER_AI_STATUS>;
