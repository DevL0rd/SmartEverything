import { MCP_TOOL_NAMES } from '@smarteverything/domain';

const DISCOVERY_GUIDE =
  'Declared tools are called directly. Any other enabled tool: search_tools, then tool_details for its exact input schema (with a variant for one action or view), then call_tool.';

export const TOOL_GUIDE = [
  DISCOVERY_GUIDE,
  'Tool guide: ids and keys come from reads, never from memory or guesses. Read first, then act.',
  'Send JSON values with their declared types: arrays and objects stay arrays and objects, never strings containing JSON. After a refused call, read the exact schema and correct the arguments before retrying; changing to call_operation does not bypass validation or access rules.',
  '- Home: get_home gives rooms, people and providers; search_everything finds anything by words; find_devices lists devices with id and capability keys.',
  '- Devices: get_device lists a device’s capability keys, allowed values and units, so call it before control_devices unless you already have them. control_devices takes changes, each with target filters (deviceIds, rooms, families or search), capability and value (null runs an action), and returns each result. edit_device action device renames, moves, hides or favourites a device or names a television’s inputs (input_names), and action camera sets a camera’s event recording, wake sensitivity and transcription. IR remotes: list_remotes (with what each is assumed to be doing), then press_remote_button; call_operation updateIrRemote corrects the assumed state or names the plug that confirms power.',
  '- control_devices shape: {"changes":[{"target":{"deviceIds":["id from a read"]},"capability":"key from get_device","value":true}]}; each capability in get_device has a value_format. Colour: a name, hex or RGB 0 to 255 (value "#ff0000" or {"r":255,"g":0,"b":0}) or {"hue":0,"saturation":100,"value":100}; brightness, fan speed and white tone (color_temperature, 2700 or "2700K" or "370 mireds") are their own capabilities. If find_devices finds nothing, ask the person; never guess raw:… ids or send to another device.',
  '- Scenes, automations, schedule: list_scenes before run_scene or edit_scene, list_automations before editing or running one, list_scheduled for a scheduleId. Automation triggers and steps need deviceId and control keys from get_device; read_signals kinds gives signal kinds and match keys; read_automation_runs shows what a run did. edit_schedule is for one-off steps later.',
  '- Cameras and history: camera_pictures live or see to look now, list_events for what happened, get_history needs deviceId and capability from get_device.',
  '- Health and food: list_people gives each personId; read_health view summary has the day’s totals (energy_in is calories eaten); find_food gives the foodId log_food needs; water is log_food action water.',
  '- log_food: inline food is an object with all required nutrition fields from its schema. edit_food: serving is an object or null, kcal is a number or null, grams is an object of nutrient keys and numeric amounts; use the chosen action’s exact variant.',
  '- edit_automation: definition is a structured object with when (triggers), onlyIf and steps; tool_details gives its schema. A step can wake the AI (ai), use any tool with its exact arguments (tool, for example speak {"target":{"kind":"device","deviceId":"a camera id"},"text":"Exact words"} to talk through a camera speaker), or change a computer; every automation records whether a person or the AI made it, shown by list_automations as author. A computer’s per-app sound and its screens (resolution, scale, position, brightness, night light) are steps audio and display: read get_computer first for the names and the features it offers.',
  '- Reaching people: list_people gives personId. read_presence shows where someone can be reached, so read it before speak, start_conversation, call_person or notify_person; hang_up needs the outreachId of the call (read_ai_activity calls lists the running ones).',
  '- speak shape: {"target":{"kind":"device","deviceId":"id from read_presence"},"text":"Exact words"}; a channel target uses kind channel and channelId instead.',
  '- show_widgets: widgets is an array of objects with a kind and that kind’s declared fields, for example {"widgets":[{"kind":"device","id":"id from a read"}]}.',
  '- Chats: read_chats finds chatId; chat_send and subagent_run take it; their answers arrive as reports.',
  '- Computers: find_devices with family computer gives the deviceId every computer tool takes. get_computer view now, audio, displays, system, usb, windows, services, startup, history or permissions; read the view first, it gives the ids and names the changes target. list_processes gives pids (pid for one program in detail); read_files browses anywhere on the computer, searches (view search), shows file details (view properties) and prepares a download of any size (view download with paths: a file as it is, a folder or several items as one zip, with a link for the person).',
  '- Computer changes: set_computer_audio (volume, mute, default device, per-app volume and output), set_computer_display, set_computer_system (power mode, Do Not Disturb, layout, Wi-Fi (off can cut the computer off from SmartEverything), Bluetooth, startup apps, services; on the hub computer it refuses stopping, restarting or disabling the hub’s own service and ending the hub’s own process, so tell the person to do those from the hub’s page), run_computer_app (apps and windows), end_process (also priority), edit_computer_files (folders, rename, move, copy, trash, restore, upload a chat attachment). A screen change that can blank a screen reverts after 15 seconds: send set_computer_display action keep only after the person says the screen looks right.',
  '- Machine actions: ring, stop ringing, open an app, open a link or file, lock and show the unlock prompt are capabilities of a phone or computer: get_device lists only the ones that machine supports and the permission a missing one needs; send them with control_devices. A computer unlock waits for the person to approve it on their phone (a phone cannot be unlocked, only woken to its PIN prompt). see takes a picture of a computer or phone screen: source desktop_screen or phone_screenshot.',
  '- Claude: read_claude view cli_sessions or cli_prompts before edit_claude_session action control or answer.',
  '- Machines: list_machines shows where this chat can run; switch_machine moves it there, and your next tool call runs on the new machine. Your chatId is in your context.',
  '- Settings: get_settings with a view before update_settings with the matching action.',
  '- Anything without its own tool: list_operations (area or search), then list_operations with operations (exact camelCase names) for their input schemas, then call_operation.',
].join('\n');

export const TOOL_MANNER =
  'Before you run tools, say one short sentence about what you are about to do, then run them at once: the request itself is the go-ahead, so never ask for permission or confirmation. When a progress note tells you long work is still running, say one short sentence about it. When the work is done, give the result.';

export const WIDGET_MANNER =
  'Attach a widget with show_widgets when seeing the thing is the answer or clearly helps, such as the camera for a look-at-it request, the device for its state or the chart for a health trend, and only one that fits. Add none to a short answer, a plain command (say what you did), a yes or no, small talk, a call, or when the person asked for brief replies.';

export const DATE_MANNER =
  'Today, tomorrow, tonight and weekdays come from the local time in your context, never from memory or a guess. Times in tool results are UTC (ending in Z): tell people the local time in the home’s time zone, and use that zone for every clock time you set.';

export const CHANGE_MANNER =
  'You can change almost anything in the home with tools, so look for the tool (search_tools, list_operations) before saying you cannot. Create, change, switch on or off, run or remove an automation, scene or schedule only when the person asked for that; otherwise suggest it in words.';

export const FORMAT_MANNER =
  'In text chat, use markdown formatting when presenting information rather than conversing, so it stays neat and easy to read; how you format it is up to you.';

const GUIDE_LINES = TOOL_GUIDE.split('\n').map((line) => ({
  line,
  names: MCP_TOOL_NAMES.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(line)),
}));

export function toolGuide(enabled: readonly string[]): string {
  const names = new Set(enabled);
  return GUIDE_LINES.filter((entry) => entry.names.every((name) => names.has(name)))
    .map((entry) => entry.line)
    .join('\n');
}
