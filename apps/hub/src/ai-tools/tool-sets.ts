import { MCP_TOOLS } from '@smarteverything/domain';
import { z } from 'zod';
import type { HubTool, ToolSpec } from './hub-tool';
import { CALL_TOOL_INPUT, SEARCH_TOOLS_INPUT, TOOL_DETAILS_INPUT } from './tool-discovery';

export const META_TOOL_NAMES = {
  call: 'call_tool',
  search: 'search_tools',
  details: 'tool_details',
} as const;

export const COMMON_TOOL_NAMES: ReadonlySet<string> = new Set([
  'get_home',
  'search_everything',
  'find_devices',
  'get_device',
  'control_devices',
  'list_people',
  'read_health',
  'log_food',
  'read_presence',
  'speak',
  'notify_person',
  'get_weather',
  'show_widgets',
  'list_machines',
  'switch_machine',
]);

export const META_TOOLS: readonly ToolSpec[] = [
  {
    name: META_TOOL_NAMES.call,
    description: 'Run any enabled tool by name with arguments from tool_details.',
    inputSchema: z.toJSONSchema(CALL_TOOL_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.search,
    description:
      'Find enabled tools and app operations (reached through call_operation) by what you want to do, best matches first; a nextCursor pages on.',
    inputSchema: z.toJSONSchema(SEARCH_TOOLS_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.details,
    description:
      'Read an enabled tool’s exact input schema, annotations and selector variants before calling it.',
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
