import type { Query, SlashCommand } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type ProviderMetadata } from '@smarteverything/domain';
import { z } from 'zod';
import { SDK_VERSION } from './options';
import type { ProviderCommandCatalogue } from './command-catalogue';
import { requireSubscription } from './job';
import { nativeSubscriptionBilling } from './billing';
import { FLAG_SETTINGS_SCHEMA, SETTINGS_EXCLUSIONS, SETTINGS_WRITER_SCHEMA } from './settings';

export const PROVIDER_OPERATIONS = [
  'seed_read_state',
  'account_info',
  'set_mcp_servers',
  'set_mcp_permission_mode',
  'rewind_files',
  'background_tasks',
  'reload_plugins',
  'reload_skills',
  'reload_output_styles',
  'usage',
  'file',
  'task_output',
  'set_model',
  'set_permission_mode',
  'apply_flags',
  'update_settings',
  'stop_task',
  'close',
  'reinitialize',
  'reconnect_mcp',
  'toggle_mcp',
  'read_mcp_resource',
  'rename_session',
  'tag_session',
  'fork_session',
  'delete_session',
  'context',
  'mcp_status',
  'tasks',
  'sessions',
  'session_info',
  'session_messages',
];

export function providerSettings(): ProviderMetadata['settings'] {
  return [
    {
      kind: 'enum',
      key: 'thinking',
      label: 'Thinking',
      values: ['adaptive', 'enabled', 'disabled'],
    },
    {
      kind: 'enum',
      key: 'thinking_display',
      label: 'Thinking display',
      values: ['summarized', 'omitted'],
    },
    {
      kind: 'enum',
      key: 'permission_mode',
      label: 'Permission mode',
      values: ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions'],
    },
    { kind: 'boolean', key: 'persist_session', label: 'Persist SDK session' },
    { kind: 'boolean', key: 'prompt_suggestions', label: 'Prompt suggestions' },
    { kind: 'boolean', key: 'agent_progress_summaries', label: 'Agent progress summaries' },
    {
      kind: 'enum',
      key: 'permission_prompts',
      label: 'Permission prompt handling',
      values: ['host', 'none'],
    },
    { kind: 'boolean', key: 'fast', label: 'Fast mode (requires model and plan support)' },
    {
      kind: 'integer',
      key: 'thinking_budget',
      label: 'Thinking token budget',
      minimum: 1,
      maximum: 2_147_483_647,
    },
    { kind: 'integer', key: 'max_turns', label: 'Maximum turns', minimum: 1, maximum: 10_000 },
  ];
}

export async function metadataOf(
  runtime: Query,
  catalogue?: ProviderCommandCatalogue,
): Promise<ProviderMetadata> {
  const [initialization, commands, agents, billing] = await Promise.all([
    runtime.initializationResult(),
    runtime.supportedCommands(),
    runtime.supportedAgents(),
    nativeSubscriptionBilling(runtime),
  ]);
  requireSubscription(initialization.account);
  const { account: _account, ...safe } = initialization;
  return {
    runtime_version: initialization.claude_code_version ?? SDK_VERSION,
    flag_settings_schema: FLAG_SETTINGS_SCHEMA,
    flag_settings_exclusions: SETTINGS_EXCLUSIONS,
    settings_writer_schema: z.record(z.string(), JSON_VALUE).parse(SETTINGS_WRITER_SCHEMA),
    commands: (catalogue === undefined
      ? commands
      : catalogue
          .descriptors()
          .filter((entry) => entry.enabled)
          .map((entry) => ({
            name: entry.name,
            description: entry.description,
            argumentHint: entry.argument_hint,
          }))
    ).map((command) => ({
      name: command.name,
      description: command.description,
      argument_hint: command.argumentHint,
    })),
    agents: agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      model: agent.model ?? null,
    })),
    settings: discoveredSettings(initialization),
    operations: PROVIDER_OPERATIONS,
    unavailable_operations: {
      set_thinking:
        'The installed SDK live thinking setter is deprecated; choose turn thinking options.',
      cancel_message:
        'The installed SDK Query exposes interrupt, but no public individual-message cancellation method.',
      user_dialog:
        'The SDK exports no per-kind user-dialog response schemas; unknown kinds are cancelled explicitly.',
    },
    initialization: metadataInitialization(JSON.parse(JSON.stringify(safe)), commands, billing),
  };
}

function discoveredSettings(
  initialization: Awaited<ReturnType<Query['initializationResult']>>,
): ProviderMetadata['settings'] {
  const efforts = [
    ...new Set(initialization.models.flatMap((model) => model.supportedEffortLevels ?? [])),
  ];
  return [
    ...providerSettings(),
    {
      kind: 'boolean',
      key: 'fastMode',
      label: 'Session flag: fast mode (requires selected model support)',
    },
    { kind: 'boolean', key: 'ultracode', label: 'Session flag: ultracode (CLI policy applies)' },
    ...(efforts.length === 0
      ? []
      : [
          {
            kind: 'enum' as const,
            key: 'effortLevel',
            label: 'Session flag: effort (selected model support applies)',
            values: efforts,
          },
        ]),
    ...(initialization.available_output_styles.length === 0
      ? []
      : [
          {
            kind: 'enum' as const,
            key: 'outputStyle',
            label: 'Session flag: output style',
            values: initialization.available_output_styles,
          },
        ]),
  ];
}
function metadataInitialization(
  json: unknown,
  commands: readonly SlashCommand[],
  billing: Awaited<ReturnType<typeof nativeSubscriptionBilling>>,
): ProviderMetadata['initialization'] {
  return {
    ...z.record(z.string(), JSON_VALUE).parse(json),
    billing_guard: { state: 'blocked', ...billing },
    native_commands: JSON_VALUE.parse(JSON.parse(JSON.stringify(commands))),
    unavailable_operations: {
      set_thinking:
        'The SDK live thinking setter is deprecated; select thinking options for the next session.',
      cancel_message:
        'The installed SDK Query exposes interrupt, but no public individual-message cancellation method.',
      user_dialog:
        'The SDK exports no per-kind user-dialog response schemas; unknown kinds are cancelled explicitly.',
    },
  };
}
