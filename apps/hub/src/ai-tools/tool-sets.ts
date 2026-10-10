import { catalogueText } from './catalogue-text';
import type { HubTool, ToolSpec } from './hub-tool';

export const META_TOOL_NAMES = { call: 'call_tool' } as const;

export const CALL_TOOL: ToolSpec = {
  name: META_TOOL_NAMES.call,
  description:
    'Runs a plugin tool from the plugin list by its name. A refused call answers with the tool’s full parameter schema.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The plugin tool’s name' },
      arguments: { type: 'object', description: 'The tool’s arguments' },
    },
    required: ['name', 'arguments'],
  },
};

function fromPlugin(tool: HubTool): boolean {
  return tool.origin.kind === 'plugin';
}

export function chatSet(enabled: readonly HubTool[]): ToolSpec[] {
  const home = enabled
    .filter((tool) => !fromPlugin(tool))
    .sort((a, b) => a.name.localeCompare(b.name));
  return home.length < enabled.length ? [...home, CALL_TOOL] : home;
}

export function chatCatalogue(enabled: readonly HubTool[]): string {
  return catalogueText(enabled.filter(fromPlugin));
}

export function toolIndex(enabled: readonly HubTool[]): string {
  return enabled
    .filter((tool) => !fromPlugin(tool))
    .map((tool) => `${tool.name}: ${tool.description.replace(/\s+/g, ' ').trim()}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}
