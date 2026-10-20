import { isMcpToolName, type McpToolName } from './served';

type Args = Readonly<Record<string, unknown>>;

interface Retired {
  readonly tool: McpToolName;
  readonly select?: Args;
  readonly otherwise?: Args;
  readonly rename?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly drop?: readonly string[];
}

const KEY = { controlKey: 'key' };
const SEQUENCE = { sequenceId: 'automationId', parameters: 'inputs', ...KEY };

const CLI_VIEWS = {
  view: {
    sessions: 'cli_sessions',
    session: 'cli_session',
    history: 'cli_history',
    operation: 'cli_operation',
    prompts: 'cli_prompts',
  },
};

const ACTIONS = (tool: McpToolName, action: string): Retired => ({ tool, select: { action } });

const RETIRED: ReadonlyMap<string, Retired> = new Map<string, Retired>([
  ['get_device_groups', { tool: 'get_home' }],
  ['start_automation', { tool: 'run_automation' }],
  ['start_automation_sequence', { tool: 'run_automation', rename: SEQUENCE }],
  ['stop_automation_sequence', { ...ACTIONS('stop_automation', 'automation'), rename: SEQUENCE }],
  ['stop_automation_run', ACTIONS('stop_automation', 'run')],
  ['stop_automation_runs', { ...ACTIONS('stop_automation', 'automation'), rename: KEY }],
  [
    'read_automation_revision',
    { tool: 'list_automations', select: { view: 'full' }, drop: ['revision'] },
  ],
  ['list_automation_sequences', { tool: 'list_automations', select: { view: 'summary' } }],
  [
    'read_automation_sequence',
    { tool: 'list_automations', select: { view: 'full' }, rename: SEQUENCE },
  ],
  [
    'remove_automation_sequence',
    { ...ACTIONS('edit_automation', 'remove'), rename: SEQUENCE, drop: ['expectedRevision'] },
  ],
  ['list_automation_runs', { tool: 'read_automation_runs', select: { view: 'list' } }],
  ['read_automation_run', { tool: 'read_automation_runs', select: { view: 'run' } }],
  ['list_automation_values', { tool: 'list_values' }],
  ['create_automation_value', ACTIONS('edit_value', 'create')],
  ['update_automation_value', ACTIONS('edit_value', 'update')],
  ['remove_automation_value', ACTIONS('edit_value', 'remove')],
  ['apply_automation_value_operation', ACTIONS('edit_value', 'apply')],
  ['schedule', { tool: 'edit_schedule' }],
  ['update_device', { tool: 'edit_device', rename: { what: 'action' } }],
  ['call', { tool: 'call_person' }],
  ['delete_transcripts', ACTIONS('edit_transcripts', 'delete')],
  ['update_transcript_settings', ACTIONS('edit_transcripts', 'settings')],
  ['write_project_files', ACTIONS('edit_project_files', 'write')],
  ['remove_project_files', ACTIONS('edit_project_files', 'remove')],
  ['publish_html', ACTIONS('edit_previews', 'publish_html')],
  ['publish_project_preview', ACTIONS('edit_previews', 'publish_project')],
  ['revoke_shared_preview', ACTIONS('edit_previews', 'revoke')],
  ['start_image_operation', ACTIONS('edit_image', 'start')],
  ['cancel_image_operation', ACTIONS('edit_image', 'cancel')],
  ['resolve_image_input', ACTIONS('edit_image', 'resolve')],
  ['wait_for_images', ACTIONS('edit_image', 'wait')],
  ['claude_start', ACTIONS('edit_claude_session', 'start')],
  ['claude_session', ACTIONS('edit_claude_session', 'control')],
  ['claude_answer', ACTIONS('edit_claude_session', 'answer')],
  ['read_claude_cli', { tool: 'read_claude', values: CLI_VIEWS }],
  ['search_preview_logs', { tool: 'read_preview_logs', select: { view: 'search' } }],
  ['read_preview_logs', { tool: 'read_preview_logs', otherwise: { view: 'read' } }],
  ['log_food', { tool: 'log_food', rename: { what: 'action' } }],
  ['get_settings', { tool: 'get_settings', rename: { area: 'view' } }],
  ['update_settings', { tool: 'update_settings', rename: { area: 'action' } }],
  ['read_files', { tool: 'read_files', rename: { kind: 'view' } }],
  ['read_transcripts', { tool: 'read_transcripts', rename: { cameraId: 'deviceId' } }],
  ['call_sight', { tool: 'call_sight', rename: { cameraId: 'deviceId' } }],
]);

const PERSON_ARGUMENTS: Readonly<Record<string, string>> = {
  profileId: 'personId',
  profileIds: 'personIds',
};

export interface ToolCall {
  readonly name: string;
  readonly arguments: Args;
}

function renamed(args: Args, names: Readonly<Record<string, string>>): Args {
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => [names[field] ?? field, value]),
  );
}

function valued(
  args: Args,
  values: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Args {
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => {
      const mapped = typeof value === 'string' ? values[field]?.[value] : undefined;
      return [field, mapped ?? value];
    }),
  );
}

function without(args: Args, fields: readonly string[]): Args {
  return Object.fromEntries(Object.entries(args).filter(([field]) => !fields.includes(field)));
}

function adapted(retired: Retired, args: Args): Args {
  const named = renamed(args, retired.rename ?? {});
  const worded = valued(named, retired.values ?? {});
  return { ...retired.otherwise, ...without(worded, retired.drop ?? []), ...retired.select };
}

export function currentToolCall(name: string, args: Args): ToolCall {
  const retired = RETIRED.get(name);
  const call =
    retired === undefined
      ? { name, arguments: args }
      : { name: retired.tool, arguments: adapted(retired, args) };
  return isMcpToolName(call.name)
    ? { name: call.name, arguments: renamed(call.arguments, PERSON_ARGUMENTS) }
    : call;
}
