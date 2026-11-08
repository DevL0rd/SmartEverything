import {
  MCP_TOOLS,
  type McpToolAccess,
  type McpToolArea,
  type McpToolName,
} from '@smarteverything/domain';

type AccessVerbs = Readonly<Record<McpToolAccess, string>>;

const AREA_VERBS: Readonly<Record<McpToolArea, AccessVerbs>> = {
  home: { read: 'read the home', control: 'edit the home' },
  devices: { read: 'read devices', control: 'change devices' },
  computers: { read: 'read the computer', control: 'use the computer' },
  control: { read: 'read devices', control: 'control devices' },
  automations: { read: 'read automations', control: 'edit automations' },
  history: { read: 'read history', control: 'edit history' },
  health: { read: 'read health', control: 'log health' },
  nutrition: { read: 'read food', control: 'log food' },
  cameras: { read: 'look at cameras', control: 'use cameras' },
  talk: { read: 'read the walkie-talkie', control: 'edit the walkie-talkie' },
  assistant: { read: 'read chats', control: 'use chats' },
  settings: { read: 'read settings', control: 'change settings' },
  people: { read: 'read people', control: 'edit people' },
  plugins: { read: 'read plugins', control: 'use plugins' },
  drive: { read: 'read Drive', control: 'edit Drive' },
  planner: { read: 'read the planner', control: 'edit the planner' },
  system: { read: 'read logs', control: 'update the app' },
  everything: { read: 'look up tools', control: 'run operations' },
};

const NAMED_VERBS: ReadonlyMap<McpToolName, string> = new Map<McpToolName, string>([
  ['weather_read', 'check the weather'],
  ['place_search', 'find places'],
  ['scene_find', 'read scenes'],
  ['scene_edit', 'edit scenes'],
  ['scene_run', 'run scenes'],
  ['remote_press', 'press remotes'],
  ['schedule_find', 'read schedules'],
  ['schedule_edit', 'edit schedules'],
  ['file_read', 'read files'],
  ['file_edit', 'edit files'],
  ['project_read', 'read files'],
  ['project_edit', 'edit files'],
  ['browser_read', 'browse the web'],
  ['browser_control', 'browse the web'],
  ['subagent_run', 'start agents'],
  ['chat_send', 'message chats'],
  ['chat_post', 'message chats'],
  ['inbox_post', 'message chats'],
  ['widget_show', 'show widgets'],
  ['app_show', 'show the app'],
  ['model_read', 'read AI models'],
  ['usage_read', 'read AI costs'],
  ['presence_read', 'find people'],
  ['person_notify', 'notify people'],
  ['chat_speak', 'speak'],
  ['voice_speak', 'speak'],
  ['call_start', 'call'],
  ['call_end', 'call'],
  ['call_show', 'call'],
  ['machine_read', 'read machines'],
  ['machine_switch', 'switch machines'],
  ['tool_result_read', 'read tool results'],
  ['reference_search', 'search chats'],
  ['camera_record', 'record cameras'],
  ['transcript_read', 'read transcripts'],
  ['transcript_edit', 'edit transcripts'],
]);

const MCP_VERBS: ReadonlyMap<string, string> = new Map(
  MCP_TOOLS.map((tool) => [
    tool.name,
    NAMED_VERBS.get(tool.name) ?? AREA_VERBS[tool.area][tool.access],
  ]),
);

export function mcpToolVerb(key: string): string | null {
  return MCP_VERBS.get(key) ?? null;
}
