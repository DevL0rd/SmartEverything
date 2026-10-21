type Args = Readonly<Record<string, unknown>>;

export interface StoredCall {
  readonly tool: string;
  readonly args: Args;
}

interface Move {
  readonly tool: string;
  readonly select?: Args;
  readonly otherwise?: Args;
  readonly rename?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly drop?: readonly string[];
}

const SAME: readonly (readonly [string, string])[] = [
  ['edit_device_group', 'group_edit'],
  ['control_device_target', 'group_control'],
  ['get_home', 'home_read'],
  ['edit_room', 'room_edit'],
  ['sync_provider', 'provider_sync'],
  ['search_places', 'place_search'],
  ['get_weather', 'weather_read'],
  ['search_everything', 'home_search'],
  ['find_devices', 'device_find'],
  ['get_device', 'device_read'],
  ['list_remotes', 'remote_find'],
  ['press_remote_button', 'remote_press'],
  ['read_phone', 'phone_read'],
  ['run_phone_action', 'phone_control'],
  ['read_watch', 'watch_read'],
  ['run_watch_action', 'watch_control'],
  ['control_devices', 'device_control'],
  ['run_scene', 'scene_run'],
  ['get_history', 'history_read'],
  ['list_events', 'event_find'],
  ['camera_pictures', 'camera_read'],
  ['see', 'sight_look'],
  ['record_camera_clip', 'camera_record'],
  ['edit_transcripts', 'transcript_edit'],
  ['read_listening', 'listening_read'],
  ['edit_listening', 'listening_edit'],
  ['list_scenes', 'scene_find'],
  ['edit_scene', 'scene_edit'],
  ['list_scheduled', 'schedule_find'],
  ['edit_schedule', 'schedule_edit'],
  ['read_signals', 'signal_read'],
  ['list_automations', 'automation_read'],
  ['run_automation', 'automation_run'],
  ['stop_automation', 'automation_stop'],
  ['read_automation_runs', 'automation_runs_read'],
  ['answer_automation_question', 'automation_answer'],
  ['list_values', 'value_read'],
  ['edit_value', 'value_edit'],
  ['read_health', 'health_read'],
  ['log_health', 'health_edit'],
  ['find_food', 'food_find'],
  ['edit_food', 'food_edit'],
  ['list_people', 'person_read'],
  ['edit_person', 'person_edit'],
  ['read_talk', 'talk_read'],
  ['edit_talk_channel', 'talk_edit'],
  ['search_chat_references', 'reference_search'],
  ['read_project_files', 'project_read'],
  ['edit_project_files', 'project_edit'],
  ['read_previews', 'preview_read'],
  ['read_embedded_browser', 'browser_read'],
  ['edit_embedded_browser', 'browser_control'],
  ['capture_preview_viewport', 'preview_capture'],
  ['read_chats', 'chat_read'],
  ['edit_chat', 'chat_edit'],
  ['assistant_post', 'chat_post'],
  ['show_widgets', 'widget_show'],
  ['show_in_app', 'app_show'],
  ['read_models', 'model_read'],
  ['read_usage', 'usage_read'],
  ['read_presence', 'presence_read'],
  ['read_ai_activity', 'outreach_read'],
  ['notify_person', 'person_notify'],
  ['speak', 'voice_speak'],
  ['hang_up', 'call_end'],
  ['ai_inbox_post', 'inbox_post'],
  ['get_computer', 'computer_read'],
  ['list_processes', 'process_read'],
  ['end_process', 'process_control'],
  ['set_computer_audio', 'computer_audio_set'],
  ['set_computer_display', 'computer_display_set'],
  ['set_computer_system', 'computer_system_set'],
  ['use_computer', 'computer_use'],
  ['run_computer_app', 'computer_app_control'],
  ['edit_computer_files', 'file_edit'],
  ['read_plugins', 'plugin_read'],
  ['update_plugin', 'plugin_edit'],
  ['call_plugin_tool', 'plugin_call'],
  ['call_operation', 'operation_call'],
  ['search_tools', 'tool_search'],
  ['tool_details', 'tool_read'],
  ['list_machines', 'machine_read'],
  ['switch_machine', 'machine_switch'],
  ['read_tool_result', 'tool_result_read'],
  ['edit_claude_session', 'claude_control'],
];

const SEQUENCE = { sequenceId: 'automationId', parameters: 'inputs', controlKey: 'key' };
const CLI_VIEWS = {
  view: {
    sessions: 'cli_sessions',
    session: 'cli_session',
    history: 'cli_history',
    operation: 'cli_operation',
    prompts: 'cli_prompts',
  },
};

const action = (tool: string, value: string): Move => ({ tool, select: { action: value } });
const view = (tool: string, value: string): Move => ({ tool, select: { view: value } });

const MOVED: readonly (readonly [string, Move])[] = [
  ['edit_device', { tool: 'device_edit', values: { action: { device: 'update' } } }],
  [
    'update_device',
    { tool: 'device_edit', rename: { what: 'action' }, values: { what: { device: 'update' } } },
  ],
  [
    'edit_previews',
    {
      tool: 'preview_edit',
      values: { action: { ignore: 'ignore_error', restore: 'restore_error' } },
    },
  ],
  [
    'clear_preview_data',
    {
      ...action('preview_edit', 'clear_data'),
      values: {
        action: { 'clear-cache': 'cache', 'clear-cookies': 'cookies', 'clear-storage': 'storage' },
      },
      rename: { action: 'target' },
    },
  ],
  ['list_speech_sources', view('signal_read', 'speech_sources')],
  ['computer_apps', view('computer_read', 'apps')],
  ['list_image_endpoints', view('model_read', 'images')],
  ['assign_body_reading', action('person_edit', 'assign_reading')],
  ['call_person', action('call_start', 'ring')],
  ['call', action('call_start', 'ring')],
  ['start_conversation', action('call_start', 'open')],
  ['call_sight', { tool: 'call_show', rename: { cameraId: 'deviceId' } }],
  ['log_food', { tool: 'food_log', rename: { what: 'action' } }],
  ['get_settings', { tool: 'settings_read', rename: { area: 'view' } }],
  ['update_settings', { tool: 'settings_edit', rename: { area: 'action' } }],
  ['read_files', { tool: 'file_read', rename: { kind: 'view' } }],
  ['read_transcripts', { tool: 'transcript_read', rename: { cameraId: 'deviceId' } }],
  ['read_preview_logs', { tool: 'preview_logs_read', otherwise: { view: 'read' } }],
  ['search_preview_logs', view('preview_logs_read', 'search')],
  ['read_claude', { tool: 'claude_read' }],
  ['read_claude_cli', { tool: 'claude_read', values: CLI_VIEWS }],
  ['claude_start', action('claude_control', 'start')],
  ['claude_session', action('claude_control', 'control')],
  ['claude_answer', action('claude_control', 'answer')],
  ['get_device_groups', { tool: 'home_read' }],
  ['start_automation', { tool: 'automation_run' }],
  ['start_automation_sequence', { tool: 'automation_run', rename: SEQUENCE }],
  ['stop_automation_sequence', { ...action('automation_stop', 'automation'), rename: SEQUENCE }],
  ['stop_automation_run', action('automation_stop', 'run')],
  [
    'stop_automation_runs',
    { ...action('automation_stop', 'automation'), rename: { controlKey: 'key' } },
  ],
  ['read_automation_revision', { ...view('automation_read', 'full'), drop: ['revision'] }],
  ['list_automation_sequences', view('automation_read', 'summary')],
  ['read_automation_sequence', { ...view('automation_read', 'full'), rename: SEQUENCE }],
  [
    'remove_automation_sequence',
    { ...action('automation_edit', 'remove'), rename: SEQUENCE, drop: ['expectedRevision'] },
  ],
  ['list_automation_runs', view('automation_runs_read', 'list')],
  ['read_automation_run', view('automation_runs_read', 'run')],
  ['list_automation_values', { tool: 'value_read' }],
  ['create_automation_value', action('value_edit', 'create')],
  ['update_automation_value', action('value_edit', 'update')],
  ['remove_automation_value', action('value_edit', 'remove')],
  ['apply_automation_value_operation', action('value_edit', 'apply')],
  ['schedule', { tool: 'schedule_edit' }],
  ['delete_transcripts', action('transcript_edit', 'delete')],
  ['update_transcript_settings', action('transcript_edit', 'settings')],
  ['write_project_files', action('project_edit', 'write')],
  ['remove_project_files', action('project_edit', 'remove')],
  ['publish_html', action('preview_edit', 'publish_html')],
  ['publish_project_preview', action('preview_edit', 'publish_project')],
  ['revoke_shared_preview', action('preview_edit', 'revoke')],
  ['edit_automation', { tool: 'automation_edit' }],
];

const MOVES: ReadonlyMap<string, Move> = new Map<string, Move>([
  ...SAME.map(([old, tool]): [string, Move] => [old, { tool }]),
  ...MOVED,
]);

const SPLITS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  settings_edit: {
    weather: 'settings_sync',
    exchange_rates: 'settings_sync',
    models: 'settings_sync',
    firewall: 'settings_sync',
    fix_firewall: 'settings_sync',
  },
  automation_edit: { set_secret: 'secret_edit', remove_secret: 'secret_edit' },
};

const SPLIT_ACTIONS: Readonly<Record<string, string>> = {
  set_secret: 'set',
  remove_secret: 'remove',
};

const PERSON_ARGUMENTS: Readonly<Record<string, string>> = {
  profileId: 'personId',
  profileIds: 'personIds',
};

function renamed(args: Args, names: Readonly<Record<string, string>>): Args {
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => [names[field] ?? field, value]),
  );
}

function valued(args: Args, values: Move['values']): Args {
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => {
      const mapped = typeof value === 'string' ? values?.[field]?.[value] : undefined;
      return [field, mapped ?? value];
    }),
  );
}

function moved(move: Move, args: Args): Args {
  const worded = valued(args, move.values);
  const named = renamed(worded, move.rename ?? {});
  const kept = Object.fromEntries(
    Object.entries(named).filter(([field]) => move.drop?.includes(field) !== true),
  );
  return camelCased(renamed({ ...move.otherwise, ...kept, ...move.select }, PERSON_ARGUMENTS));
}

function camelCased(args: Args): Args {
  return Object.fromEntries(
    Object.entries(args).map(([field, value]) => [
      field.replace(/_([a-z0-9])/gu, (_match, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

function split(call: StoredCall): StoredCall {
  const chosen = call.args['action'];
  const target = typeof chosen === 'string' ? SPLITS[call.tool]?.[chosen] : undefined;
  if (target === undefined || typeof chosen !== 'string') {
    return call;
  }
  return { tool: target, args: { ...call.args, action: SPLIT_ACTIONS[chosen] ?? chosen } };
}

export function currentCall(call: StoredCall): StoredCall | null {
  const move = MOVES.get(call.tool);
  if (move === undefined) {
    return null;
  }
  return split({ tool: move.tool, args: moved(move, call.args) });
}

export const DROPPED_TOOLS: ReadonlySet<string> = new Set(['list_operations']);

const MERGED: ReadonlySet<string> = new Set(
  MOVED.filter(([, move]) => move.select !== undefined).map(([old]) => old),
);

export function currentGrantNames(name: string): readonly string[] {
  if (MERGED.has(name) || DROPPED_TOOLS.has(name)) {
    return [];
  }
  const tool = MOVES.get(name)?.tool ?? name;
  return [tool, ...new Set(Object.values(SPLITS[tool] ?? {}))];
}
