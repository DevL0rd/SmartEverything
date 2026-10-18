import { z } from 'zod';
import { CLAUDE_SETTABLE_MODE } from '../claude';
import { CLAUDE_MCP_SERVERS, COMPUTER_AI_SETTING, COMPUTER_AI_SETTING_VALUE } from '../computer-ai';
import { JSON_VALUE } from '../values';

const SESSION_ID = z.string().min(1).max(200);
export const PROVIDER_COMMAND = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  argument_hint: z.string().max(2000).nullable(),
});
export const PROVIDER_AGENT = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  model: z.string().max(200).nullable(),
});
export const PROVIDER_METADATA = z.strictObject({
  flag_settings_schema: z.record(z.string(), JSON_VALUE).default({}),
  flag_settings_exclusions: z.record(z.string(), z.string()).default({}),
  settings_writer_schema: z.record(z.string(), JSON_VALUE).default({}),
  runtime_version: z.string().min(1).max(100),
  commands: z.array(PROVIDER_COMMAND).max(500),
  agents: z.array(PROVIDER_AGENT).max(500),
  settings: z.array(COMPUTER_AI_SETTING).max(500),
  operations: z.array(z.string().min(1).max(100)).max(100),
  unavailable_operations: z
    .record(z.string().min(1).max(100), z.string().min(1).max(2000))
    .default({}),
  initialization: z.record(z.string(), JSON_VALUE),
});
export type ProviderMetadata = z.infer<typeof PROVIDER_METADATA>;
export const PROVIDER_CONTROL = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('seed_read_state'),
    path: z.string().min(1).max(4096),
    mtime: z.int().nonnegative(),
  }),
  z.strictObject({ action: z.literal('set_mcp_servers'), servers: CLAUDE_MCP_SERVERS }),
  z.strictObject({
    action: z.literal('set_thinking'),
    max_tokens: z.int().nonnegative().nullable(),
    display: z.enum(['summarized', 'omitted']).nullable().optional(),
  }),
  z.strictObject({
    action: z.literal('set_mcp_permission_mode'),
    server: z.string().min(1).max(200),
    mode: z.enum(['default', 'auto']).nullable(),
  }),
  z.strictObject({
    action: z.literal('rewind_files'),
    message_id: z.uuid(),
    dry_run: z.boolean().default(true),
  }),
  z.strictObject({
    action: z.literal('background_tasks'),
    tool_use_id: z.string().min(1).max(200).optional(),
  }),
  z.strictObject({
    action: z.literal('reload_plugins'),
    hold_on_cache_impact: z.boolean().default(true),
  }),
  z.strictObject({ action: z.literal('reload_skills') }),
  z.strictObject({ action: z.literal('reload_output_styles') }),
  z.strictObject({ action: z.literal('set_model'), model: z.string().min(1).max(200) }),
  z.strictObject({ action: z.literal('set_permission_mode'), mode: CLAUDE_SETTABLE_MODE }),
  z.strictObject({
    action: z.literal('apply_flags'),
    values: z.record(z.string().min(1).max(100), JSON_VALUE),
  }),
  z.strictObject({
    action: z.literal('update_settings'),
    source: z.enum(['localSettings', 'userSettings']),
    values: z.record(z.string().min(1).max(100), COMPUTER_AI_SETTING_VALUE),
  }),
  z.strictObject({ action: z.literal('cancel_message'), message_id: z.uuid() }),
  z.strictObject({ action: z.literal('stop_task'), task_id: z.string().min(1).max(200) }),
  z.strictObject({ action: z.literal('close') }),
  z.strictObject({ action: z.literal('reinitialize') }),
  z.strictObject({ action: z.literal('reconnect_mcp'), server: z.string().min(1).max(200) }),
  z.strictObject({
    action: z.literal('toggle_mcp'),
    server: z.string().min(1).max(200),
    enabled: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('read_mcp_resource'),
    server: z.string().min(1).max(200),
    uri: z.string().min(1).max(4096),
  }),
  z.strictObject({
    action: z.literal('rename_session'),
    session_id: SESSION_ID,
    title: z.string().min(1).max(500),
  }),
  z.strictObject({
    action: z.literal('tag_session'),
    session_id: SESSION_ID,
    tag: z.string().min(1).max(200).nullable(),
  }),
  z.strictObject({
    action: z.literal('fork_session'),
    session_id: SESSION_ID,
    through_message_id: z.uuid().optional(),
  }),
  z.strictObject({ action: z.literal('delete_session'), session_id: SESSION_ID }),
]);
export type ProviderControl = z.infer<typeof PROVIDER_CONTROL>;
export const PROVIDER_READ_QUERY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('account_info') }),
  z.strictObject({
    kind: z.literal('context'),
    detail: z.enum(['summary', 'full']).default('summary'),
  }),
  z.strictObject({ kind: z.literal('usage'), skip_behaviors: z.boolean().default(true) }),
  z.strictObject({
    kind: z.literal('file'),
    path: z.string().min(1).max(4096),
    max_bytes: z.int().min(1).max(4_194_304).default(1_048_576),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  }),
  z.strictObject({ kind: z.literal('mcp_status') }),
  z.strictObject({ kind: z.literal('tasks') }),
  z.strictObject({ kind: z.literal('task_output'), task_id: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal('sessions'), limit: z.int().min(1).max(200).default(100) }),
  z.strictObject({ kind: z.literal('session_info'), session_id: SESSION_ID }),
  z.strictObject({
    kind: z.literal('session_messages'),
    session_id: SESSION_ID,
    limit: z.int().min(1).max(200).default(100),
  }),
]);

export type ProviderReadQuery = z.infer<typeof PROVIDER_READ_QUERY>;

export const PROVIDER_FILE_SEARCH = z.strictObject({
  cwd: z.string().min(1).max(4096),
  query: z.string().max(200),
  limit: z.int().min(1).max(50),
});
export const PROVIDER_FILE_MATCHES = z.strictObject({
  entries: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(300),
        entry_kind: z.enum(['file', 'directory']),
        version: z.string().min(1).max(300),
      }),
    )
    .max(50),
  incomplete: z.boolean(),
});
export type ProviderFileMatches = z.infer<typeof PROVIDER_FILE_MATCHES>;
