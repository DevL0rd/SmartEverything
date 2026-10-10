import { catalogueText } from './catalogue-text';
import type { HubTool, ToolSpec } from './hub-tool';

export const META_TOOL_NAMES = { call: 'call_tool' } as const;

export const DIRECT_TOOLS: ReadonlySet<string> = new Set([
  'get_home',
  'find_devices',
  'get_device',
  'search_everything',
  'control_devices',
  'run_scene',
  'list_scenes',
  'camera_pictures',
  'speak',
  'start_conversation',
  'call',
  'get_weather',
  'read_health',
  'log_food',
  'press_remote_button',
  'chat_send',
  'subagent_run',
]);

export const CALL_TOOL: ToolSpec = {
  name: META_TOOL_NAMES.call,
  description:
    'Runs a catalogue tool by its name with its arguments. A refused call answers with the tool’s full parameter schema.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The catalogue tool’s name' },
      arguments: { type: 'object', description: 'The tool’s arguments' },
    },
    required: ['name', 'arguments'],
  },
};

export function directSet(enabled: readonly HubTool[]): ToolSpec[] {
  return [...enabled.filter((tool) => DIRECT_TOOLS.has(tool.name)), CALL_TOOL];
}

export function catalogueOf(enabled: readonly HubTool[]): string {
  return catalogueText(enabled.filter((tool) => !DIRECT_TOOLS.has(tool.name)));
}

function fromPlugin(tool: HubTool): boolean {
  return tool.origin.kind === 'plugin';
}

export function chatSet(enabled: readonly HubTool[]): ToolSpec[] {
  const home = enabled.filter((tool) => !fromPlugin(tool));
  return home.length < enabled.length ? [...home, CALL_TOOL] : home;
}

export function chatCatalogue(enabled: readonly HubTool[]): string {
  return catalogueText(enabled.filter(fromPlugin));
}
