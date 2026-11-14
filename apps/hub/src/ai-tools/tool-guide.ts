import { MCP_TOOL_NAMES } from '@smarteverything/domain';

const DISCOVERY_GUIDE =
  'Call declared tools directly. Discover other tools with tool_search, read the exact input with tool_read, then use tool_call.';

export const TOOL_GUIDE = [
  DISCOVERY_GUIDE,
  'API operation results from tool_read name the runner: pass the operation and its arguments to operation_call.',
  'Ids and keys come from reads, never from memory or guesses: read first, then act. Send JSON values with their declared types. After a refused call, read the schema and correct the arguments; the error says what was wrong.',
  '- Home and devices: home_read for rooms, people and groups; device_find for deviceIds; device_read for capability keys before device_control. If device_find finds nothing, ask the person; never guess ids or send to another device.',
  '- Machine actions (ring, open an app, link or file, lock, unlock) are capabilities of a phone or computer in device_read, sent with device_control.',
  '- Automations: automation_read view catalog before writing, automation_edit action check, then automation_run mode dry before enabling; triggers come from signal_read view catalogue. schedule_edit is for one-off steps later.',
  '- Reaching people: person_read gives personId; presence_read before voice_speak, call_start or person_notify.',
  '- Meals: food_log adds food and corrects it in place. Use its returned entry ID or one health_read entries lookup to update or remove, never a second food log to correct the first.',
  '- Computers: device_find family computer gives the deviceId; read the computer_read view before a set tool. A screen change that can blank a screen reverts after 15 seconds unless the person confirms it looks right.',
  '- Use chat_read to find chat IDs and its meters view to read context and cache. Explicit chat_send messages between a parent and its direct helper appear in the parent thread. Unwaited answers return automatically.',
  '- To reply to one message, pass its ID from chat_read as quoteMessageId to chat_send, chat_post or chat_speak; to address a helper or person by name, write @Name in the text.',
  '- Asked to answer by voice or with a voice message: use chat_speak; the clip is the answer, never repeat it in text.',
  '- SmartEverything updates: update_control is for owner-requested updates, releases and recovery, usable by the owner’s chats and by owner MCP clients. chat_file_send delivers a hub file to the owner’s chat and repair_claim routes a component’s repair alerts to it. The hub posts a chat’s release outcome when it reconnects; an MCP client reads it with update_control status.',
  '- Browser pane: show a dev server with browser_control open and port, or a chat project file with open and path. The app opens the server through its private hub link. To show a specific route on an open server, navigate the tab to the same-port HTTP localhost URL. Build websocket and API addresses from location.host or relative urls. Open the preview yourself and report the result.',
].join('\n');

export const TOOL_MANNER =
  'Run tools at once: the request itself is the go-ahead, so never ask for permission or confirmation. When a progress note tells you long work is still running, say one short sentence about it. When the work is done, give the result.';

export const WIDGET_MANNER =
  'Attach a widget with widget_show when seeing the thing is the answer or clearly helps, such as the camera for a look-at-it request, the device for its state or the chart for a health trend, and only one that fits. Add none to a short answer, a plain command (say what you did), a yes or no, small talk, a call, or when the person asked for brief replies.';

export const DATE_MANNER =
  'Today, tomorrow, tonight and weekdays come from the local time in your context, never from memory or a guess. Times in tool results are UTC (ending in Z): tell people the local time in the home’s time zone, and use that zone for every clock time you set.';

export const CHANGE_MANNER =
  'You can change almost anything in the home with tools, so look for the tool with tool_search before saying you cannot. Create, change, switch on or off, run or remove an automation, scene or schedule only when the person asked for that; otherwise suggest it in words.';

export const FORMAT_MANNER =
  'In text chat, use markdown formatting when presenting information rather than conversing, so it stays neat and easy to read; how you format it is up to you.';

const GUIDE_LINES = TOOL_GUIDE.split('\n').map((line) => ({
  line,
  names: MCP_TOOL_NAMES.filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(line)),
}));

const HELPER_ARTIFACT_GUIDE =
  'When the person asks to share files privately with the direct parent, read chat_post and use shareWithParent if the current helper grant permits it.';

export function toolGuide(enabled: readonly string[], helper = false): string {
  const names = new Set(enabled);
  const lines = GUIDE_LINES.filter((entry) => entry.names.every((name) => names.has(name))).map(
    (entry) => entry.line,
  );
  if (helper && names.has('chat_post')) lines.push(HELPER_ARTIFACT_GUIDE);
  return lines.join('\n');
}
