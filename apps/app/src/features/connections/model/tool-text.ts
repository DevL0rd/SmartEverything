import type { McpToolName, McpToolSummary } from '@smarteverything/domain';

interface ToolText {
  readonly title?: string;
  readonly line: string;
}

const TEXT: Readonly<Record<McpToolName, ToolText>> = {
  get_device_groups: { title: 'Read device groups', line: 'Named groups and their member devices' },
  edit_device_group: {
    title: 'Edit device groups',
    line: 'Create, rename, change members or remove a group',
  },
  control_device_target: {
    title: 'Control a room or group',
    line: 'Supported members with individual command outcomes',
  },
  search_chat_references: {
    title: 'Find chat references',
    line: 'Finds available files, folders, skills, plugins and owned chats without loading their contents',
  },
  read_preview_error_policy: {
    title: 'Read ignored browser errors',
    line: 'Lists recurring errors excluded from automatic notifications in this chat',
  },
  write_preview_error_policy: {
    title: 'Change browser error notifications',
    line: 'Ignores a captured recurring error or restores its notifications; raw logs stay visible',
  },
  read_embedded_browser: {
    title: 'Read browser tabs',
    line: 'Reads tabs and available actions on the connected viewing device',
  },
  edit_embedded_browser: {
    title: 'Edit browser tabs',
    line: 'Opens, selects, navigates, reloads, closes or reorders tabs on the viewing device',
  },
  clear_preview_data: {
    title: 'Clear preview website data',
    line: 'Clears the selected preview’s cache or cookies only',
  },
  read_preview_logs: {
    title: 'Read preview console',
    line: 'Reads bounded console entries from the viewing device, with stable cursors',
  },
  search_preview_logs: {
    title: 'Search preview console',
    line: 'Finds text, severity, source and stack in retained viewing-device logs',
  },
  capture_preview_viewport: {
    title: 'Capture visible preview',
    line: 'Captures the current viewport on the viewing device; hidden or unsupported views are unavailable',
  },
  read_project_files: {
    title: 'Read chat project files',
    line: 'Reads, lists or searches files in the chat’s central project',
  },
  write_project_files: {
    title: 'Change chat project files',
    line: 'Writes or edits files in the chat’s central project',
  },
  remove_project_files: {
    title: 'Remove chat project files',
    line: 'Removes selected files from the chat’s central project',
  },
  publish_project_preview: {
    title: 'Show project in the browser',
    line: 'Shares a multi-file project from the chat’s central workspace',
  },
  publish_html: {
    title: 'Show HTML in the browser',
    line: 'Shows or updates standalone HTML shared with the conversation',
  },
  read_previews: {
    title: 'Read shared previews',
    line: 'Lists development services shared with the conversation',
  },
  revoke_shared_preview: {
    title: 'Stop sharing preview',
    line: 'Revokes access to a shared development service',
  },
  get_home: { title: 'See the home', line: 'Rooms, devices, people and providers' },
  edit_room: { title: 'Edit rooms', line: 'Add, rename, reorder or remove' },
  sync_provider: { title: 'Sync a provider', line: 'Fetch its devices again' },
  search_places: { title: 'Find a place', line: 'Towns and cities by name' },
  get_weather: { title: 'Weather', line: 'Now and the forecast' },
  search_everything: { title: 'Search everything', line: 'Devices, rooms, people and more' },
  find_devices: { title: 'Find devices', line: 'By room, kind, feature or name' },
  get_device: { title: 'Read a device', line: 'Every setting and its value' },
  update_device: { title: 'Change a device', line: 'Name, room, order, camera recording' },
  list_remotes: { title: 'List remotes', line: 'Infrared remotes and their buttons' },
  press_remote_button: { title: 'Press a remote button', line: 'Through its blaster' },
  read_phone: { title: 'What someone is doing', line: 'Driving, walking, at home and more' },
  run_phone_action: {
    title: 'Use a phone',
    line: 'Ring it, flashlight, volume, Do Not Disturb, media',
  },
  read_watch: { title: 'Read a watch', line: 'Settings, alarms, faces and workouts' },
  run_watch_action: { title: 'Use a watch', line: 'Find, settings, alarms and workouts' },
  control_devices: { title: 'Control devices', line: 'Any setting on any device, room or kind' },
  run_scene: { title: 'Run a scene', line: 'Every command in it' },
  get_history: { title: 'Device history', line: 'How a value changed over time' },
  list_events: { title: 'List events', line: 'Motion, doorbell, alarms and more' },
  camera_pictures: { title: 'Camera pictures', line: 'Live or saved' },
  see: { title: 'Look at one thing', line: 'A camera, a screen or a window, once' },
  record_camera_clip: { title: 'Record a clip', line: '5 seconds to 5 minutes' },
  read_transcripts: { title: 'Read transcripts', line: 'What cameras heard, search, status' },
  delete_transcripts: { title: 'Delete a transcript', line: 'One transcript and its lines' },
  update_transcript_settings: { title: 'Transcript settings', line: 'How long to keep, daily cap' },
  list_scenes: { title: 'List scenes', line: 'With their actions' },
  edit_scene: { title: 'Edit scenes', line: 'Add, change or remove' },
  list_automations: { title: 'List automations', line: 'Triggers, actions and last run' },
  edit_automation: { title: 'Edit automations', line: 'Add, change, switch or remove' },
  run_automation: { title: 'Run an automation', line: 'Its actions, right now' },
  read_automation_revision: {
    title: 'Read an automation',
    line: 'Current settings and revision before saving changes',
  },
  list_automation_sequences: {
    title: 'List sequences',
    line: 'Read reusable sequences and their parameters.',
  },
  read_automation_sequence: {
    title: 'Read a sequence',
    line: 'Read a reusable sequence and its revision.',
  },
  create_automation_sequence: {
    title: 'Create a sequence',
    line: 'Save a reusable action sequence.',
  },
  update_automation_sequence: {
    title: 'Update a sequence',
    line: 'Replace a reusable sequence at its current revision.',
  },
  remove_automation_sequence: {
    title: 'Remove a sequence',
    line: 'Delete an unreferenced reusable sequence.',
  },
  start_automation_sequence: {
    title: 'Start a sequence',
    line: 'Start a reusable sequence with typed parameters.',
  },
  stop_automation_sequence: {
    title: 'Stop a sequence',
    line: 'Cancel future actions in active and queued sequence runs.',
  },
  list_automation_values: {
    title: 'List automation Values',
    line: 'Current boolean, number, duration and choice values',
  },
  create_automation_value: {
    title: 'Create an automation Value',
    line: 'A boolean, number, duration or ordered choice',
  },
  update_automation_value: {
    title: 'Change an automation Value',
    line: 'Its settings and value at the expected revision',
  },
  apply_automation_value_operation: {
    title: 'Apply a Value operation',
    line: 'Set, toggle, add, subtract or cycle in one operation',
  },
  remove_automation_value: {
    title: 'Remove an automation Value',
    line: 'Delete it when no automation refers to it',
  },
  list_automation_runs: {
    title: 'List automation runs',
    line: 'Recent runs, statuses and outcomes',
  },
  read_automation_run: {
    title: 'Read an automation run',
    line: 'Step outcomes and linked device commands',
  },
  stop_automation_run: {
    title: 'Stop an automation run',
    line: 'Cancel future steps; sent commands may still finish',
  },
  stop_automation_runs: {
    title: 'Stop automation runs',
    line: 'Cancel active and queued runs, optionally by control key',
  },
  start_automation: {
    title: 'Start an automation',
    line: 'Run saved actions, skipping triggers and conditions',
  },
  list_scheduled: { title: 'List scheduled', line: 'What is waiting to run, and how it went' },
  schedule: { title: 'Schedule', line: 'Plan steps for later, change or cancel them' },
  read_signals: { title: 'Read signals', line: 'Everything an automation can react to' },
  list_speech_sources: {
    title: 'Read speech sources',
    line: 'Authorized sources available for spoken-word automation triggers',
  },
  read_health: { title: 'Read health', line: 'Days, records, logs and types' },
  log_health: { title: 'Log health', line: 'Add, change or delete a record' },
  find_food: { title: 'Find food', line: 'Saved foods, products and barcodes' },
  edit_food: { title: 'Edit foods', line: 'Save, change or forget' },
  log_food: { title: 'Log food or water', line: 'A portion or a drink' },
  list_people: { title: 'List people', line: 'Body facts, goals and apps' },
  edit_person: { title: 'Edit people', line: 'Add, change, remove or set goals' },
  assign_body_reading: { title: 'Assign a scale reading', line: 'Who stood on the scale' },
  get_settings: { title: 'Read settings', line: 'App, firewall, assistant, AI and budget' },
  update_settings: { title: 'Change settings', line: 'Home, preferences, assistant, AI and tools' },
  read_talk: { title: 'Read walkie-talkie', line: 'Channels, members and messages' },
  edit_talk_channel: { title: 'Edit walkie channels', line: 'Channels and their members' },
  read_chats: { title: 'Read chats', line: 'Chats, search, messages and files' },
  edit_chat: { title: 'Edit chats', line: 'Start, rename, pin, archive, branch, stop or delete' },
  chat_send: { title: 'Message another chat', line: 'Its AI answers back by itself' },
  subagent_run: { title: 'Run a subagent', line: 'A helper chat works on a task' },
  assistant_post: { title: 'Post to a chat', line: 'A message at any time' },
  show_widgets: { title: 'Show widgets', line: 'Cards and charts under a reply' },
  list_image_endpoints: {
    title: 'Read image providers',
    line: 'Image models, supported options and metered readiness',
  },
  resolve_image_input: {
    title: 'Choose a saved image',
    line: 'Freeze a source or reference from this chat',
  },
  start_image_operation: {
    title: 'Create or edit images',
    line: 'Uses the selected metered provider; originals stay intact',
  },
  cancel_image_operation: {
    title: 'Cancel an image operation',
    line: 'Request cancellation; provider billing may remain unknown',
  },
  wait_for_images: {
    title: 'Wait for images',
    line: 'Finish an image batch before the next step',
  },
  read_models: { title: 'Read AI models', line: 'Names, prices and thinking levels' },
  read_usage: { title: 'Read AI costs', line: 'Totals, over time, one by one' },
  read_presence: {
    title: 'Where is someone',
    line: 'Their apps, phone, last seen in the home, quiet hours',
  },
  read_ai_activity: { title: 'AI activity', line: 'Conversations it started, calls and wake-ups' },
  notify_person: { title: 'Message someone', line: 'A note in their chat, with a notification' },
  speak: { title: 'Say something', line: 'Once, on a camera, an app or a walkie channel' },
  start_conversation: {
    title: 'Start a conversation',
    line: 'Talk live through a camera, a walkie channel or an app',
  },
  call: { title: 'Call someone', line: 'Rings their phone, computer or any app' },
  hang_up: { title: 'Hang up', line: 'Stop ringing or end a conversation' },
  call_sight: { title: 'Show something in a call', line: 'A home camera, or stop looking' },
  ai_inbox_post: { title: 'Hand over a message', line: 'Plugins only: a chat message to answer' },
  get_computer: { title: 'Read a computer', line: 'Load, history and permissions' },
  list_processes: { title: 'List programs', line: 'Busiest programs running on a computer' },
  end_process: { title: 'End a program', line: 'End, pause or resume your own program' },
  computer_apps: { title: 'List apps', line: 'Installed apps and time spent in each' },
  run_computer_app: { title: 'Open or close an app', line: 'On a computer' },
  read_files: { title: 'Read files', line: 'Folders and files in your home folder' },
  read_plugins: { title: 'Read plugins', line: 'Status, tools, data and log' },
  update_plugin: { title: 'Change a plugin', line: 'Switch it, its tools, settings or restart' },
  call_plugin_tool: { title: 'Use a plugin tool', line: 'Run one thing a plugin offers' },
  read_claude: {
    title: 'Read legacy Claude',
    line: 'Historical records, transcripts and legacy usage',
  },
  read_claude_cli: {
    title: 'Read owned Claude CLI',
    line: 'Shared sessions, history, prompts and operation receipts',
  },
  claude_session: {
    title: 'Control Claude',
    line: 'Send, resume, stop, close, set permission mode or model',
  },
  claude_start: { title: 'Start Claude', line: 'Run the first prompt in an owned shared CLI chat' },
  claude_answer: { title: 'Answer Claude', line: 'Allow, deny or answer what it asks' },
  list_operations: { title: 'List app operations', line: 'Everything the app can do' },
  call_operation: { title: 'Run an app operation', line: 'Anything without its own tool' },
  search_tools: { title: 'Search tools', line: 'For other AI apps' },
  tool_details: { title: 'Tool details', line: 'For other AI apps' },
};

export function toolTitle(tool: McpToolSummary<McpToolName>): string {
  return TEXT[tool.name].title ?? tool.title;
}

export function toolLine(tool: McpToolSummary<McpToolName>): string {
  return TEXT[tool.name].line;
}
