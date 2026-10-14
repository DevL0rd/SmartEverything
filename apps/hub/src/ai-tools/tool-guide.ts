import { MCP_TOOL_NAMES } from '@smarteverything/domain';

const DISCOVERY_GUIDE =
  'Common tools have declarations. For other enabled tools, use search_tools, then tool_details for the exact input schema and selector variants before call_tool. If discovery is switched off, use the tools documentation or existing known schemas; do not guess.';

export const TOOL_GUIDE = [
  DISCOVERY_GUIDE,
  'Tool guide: ids and keys come from reads, never from memory or guesses. Read first, then act.',
  'Send JSON values with their declared types: arrays and objects stay arrays and objects, never strings containing JSON. After a refused call, read the exact schema and correct the arguments before retrying; changing to call_operation does not bypass validation or access rules.',
  '- Home: get_home gives rooms, people and providers; search_everything finds anything by words; find_devices lists devices with id and capability keys.',
  '- Devices: get_device lists a device’s capability keys, allowed values and units, so call it before control_devices unless you already have them. control_devices takes changes, each with target filters (deviceIds, rooms, families or search), capability and value (null runs an action), and returns each result. update_device only renames, moves or hides. IR remotes: list_remotes, then press_remote_button.',
  '- control_devices shape: {"changes":[{"target":{"deviceIds":["id from a read"]},"capability":"key from get_device","value":true}]}; substitute the read ids, key and its allowed value.',
  '- Scenes, automations, schedule: list_scenes before run_scene or edit_scene, list_automations before editing or running one, list_scheduled for a scheduleId. Automation triggers and actions need deviceId and capability from get_device; read_signals kinds gives signal kinds and match keys. schedule is for one-off steps later.',
  '- Cameras and history: camera_pictures live or see to look now, list_events for what happened, get_history needs deviceId and capability from get_device.',
  '- Health and food: list_people gives each profileId; read_health view summary has the day’s totals (energy_in is calories eaten); find_food gives the foodId log_food needs; water is log_food what water.',
  '- log_food: inline food is an object with all required nutrition fields from its schema. edit_food: serving is an object or null, kcal is a number or null, grams is an object of nutrient keys and numeric amounts; use the chosen action’s exact variant.',
  '- edit_automation: definition is a structured object containing triggers and actions; read its exact schema before composing it.',
  '- Reaching people: list_people gives personId. read_presence shows where someone can be reached, so read it before speak, start_conversation, call or notify_person; hang_up needs the outreachId of the call (read_ai_activity calls lists the running ones).',
  '- speak shape: {"target":{"kind":"device","deviceId":"id from read_presence"},"text":"Exact words"}; a channel target uses kind channel and channelId instead.',
  '- show_widgets: widgets is an array of objects with a kind and that kind’s declared fields, for example {"widgets":[{"kind":"device","id":"id from a read"}]}.',
  '- Chats: read_chats finds chatId; chat_send and subagent_run take it; their answers arrive as reports.',
  '- Computers and Claude: find_devices with family computer gives the deviceId for get_computer, list_processes, read_files and run_computer_app; read_claude sessions or prompts before claude_session or claude_answer.',
  '- Settings: get_settings with the area before update_settings with that area.',
  '- Anything without its own tool: list_operations (area or search), then list_operations with operations (exact camelCase names) for their input schemas, then call_operation.',
].join('\n');

export const TOOL_MANNER =
  'Before you run tools, say one short sentence about what you are about to do, then run them at once: the request itself is the go-ahead, so never ask for permission or confirmation. When a progress note tells you long work is still running, say one short sentence about it. When the work is done, give the result.';

export const WIDGET_MANNER =
  'Always attach the widgets that fit the request with show_widgets when you can, such as the camera for a camera question, the device for a device question or the chart for a health question, and never attach ones that do not fit.';

export const FORMAT_MANNER =
  'In text chat, use markdown formatting when presenting information rather than conversing, so it stays neat and easy to read; how you format it is up to you.';

const GUIDE_LINES = TOOL_GUIDE.split('\n').map((line) => ({
  line,
  names: MCP_TOOL_NAMES.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(line)),
}));

export function toolGuide(
  enabled: readonly string[],
  presentation: 'discovery' | 'declarations' = 'discovery',
): string {
  const names = new Set(enabled);
  const guide = GUIDE_LINES.filter(
    (entry) =>
      (presentation === 'discovery' || entry.line !== DISCOVERY_GUIDE) &&
      entry.names.every((name) => names.has(name)),
  ).map((entry) => entry.line);
  if (presentation === 'declarations')
    guide.unshift(
      'Enabled tools have native declarations: call them directly with their declared arguments. Use enabled search_tools and tool_details for discovery when needed.',
    );
  return guide.join('\n');
}
