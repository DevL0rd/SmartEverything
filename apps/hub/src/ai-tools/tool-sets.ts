import { MCP_TOOLS, type McpToolName } from '@smarteverything/domain';
import { z } from 'zod';
import type { HubTool, ToolSpec } from './hub-tool';
import { CALL_TOOL_INPUT, SEARCH_TOOLS_INPUT, TOOL_DETAILS_INPUT } from './tool-discovery';

export const META_TOOL_NAMES = {
  call: 'tool_call',
  search: 'tool_search',
  details: 'tool_read',
} as const;

export const COMMON_TOOL_NAMES: ReadonlySet<string> = new Set([
  'home_read',
  'home_search',
  'device_find',
  'device_read',
  'device_control',
  'person_read',
  'health_read',
  'food_log',
  'presence_read',
  'voice_speak',
  'person_notify',
  'weather_read',
  'widget_show',
  'machine_read',
  'machine_switch',
]);

function servedDescription(name: McpToolName): string {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new Error(`The served tool ${name} is missing from MCP_TOOLS`);
  }
  return tool.description;
}

export const META_TOOLS: readonly ToolSpec[] = [
  {
    name: META_TOOL_NAMES.call,
    description:
      'Runs any enabled tool that is not declared, by its name with arguments matching tool_read. Not for API operations (operation_call) or the declared tools (call them directly).',
    inputSchema: z.toJSONSchema(CALL_TOOL_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.search,
    description: servedDescription('tool_search'),
    inputSchema: z.toJSONSchema(SEARCH_TOOLS_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.details,
    description: servedDescription('tool_read'),
    inputSchema: z.toJSONSchema(TOOL_DETAILS_INPUT, { io: 'input' }),
  },
];

export function chatSet(enabled: readonly HubTool[]): ToolSpec[] {
  const common = enabled.filter((tool) => COMMON_TOOL_NAMES.has(tool.name));
  return [...common, ...META_TOOLS].sort((a, b) => a.name.localeCompare(b.name));
}

export function chatCatalogue(enabled: readonly HubTool[]): string {
  return enabled
    .filter((tool) => tool.origin.kind === 'plugin')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => `${tool.name}: ${tool.title}`)
    .join('\n');
}

export interface IndexedTool {
  readonly name: string;
  readonly area: string;
}

export function indexedTools(
  enabled: readonly HubTool[],
  declared: ReadonlySet<string> = COMMON_TOOL_NAMES,
): IndexedTool[] {
  return enabled
    .filter(
      (tool) =>
        tool.origin.kind !== 'plugin' &&
        !declared.has(tool.name) &&
        !META_TOOLS.some((meta) => meta.name === tool.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => ({
      name: tool.name,
      area: MCP_TOOLS.find((entry) => entry.name === tool.name)?.area ?? tool.origin.kind,
    }));
}

export function toolIndex(enabled: readonly HubTool[]): string {
  return indexedTools(enabled)
    .map((tool) => `${tool.name} (${tool.area})`)
    .join('\n');
}
