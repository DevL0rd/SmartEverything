import { MCP_TOOLS } from '@smarteverything/domain';
import { z } from 'zod';
import type { HubTool, ToolSpec } from './hub-tool';
import { portableSchemaOf, ToolSchemaReferenceError } from './portable-schema';
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
]);

export const META_TOOLS: readonly ToolSpec[] = [
  {
    name: META_TOOL_NAMES.call,
    description: 'Run any enabled tool by name with arguments from tool_details.',
    inputSchema: z.toJSONSchema(CALL_TOOL_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.search,
    description: 'Find enabled tools by words; returns descriptions, matched count and hasMore.',
    inputSchema: z.toJSONSchema(SEARCH_TOOLS_INPUT, { io: 'input' }),
  },
  {
    name: META_TOOL_NAMES.details,
    description:
      'Read an enabled tool’s exact input schema, annotations and selector variants before calling it.',
    inputSchema: z.toJSONSchema(TOOL_DETAILS_INPUT, { io: 'input' }),
  },
];

export function discoveryAvailable(enabled: readonly HubTool[]): boolean {
  return [META_TOOL_NAMES.search, META_TOOL_NAMES.details].every((name) =>
    enabled.some((tool) => tool.name === name),
  );
}

export function chatSet(enabled: readonly HubTool[]): ToolSpec[] {
  if (!discoveryAvailable(enabled)) {
    return [
      ...enabled.filter(declarationAvailable),
      ...META_TOOLS.filter((tool) => tool.name === META_TOOL_NAMES.call),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }
  const common = enabled.filter((tool) => COMMON_TOOL_NAMES.has(tool.name));
  const meta = META_TOOLS.filter(
    (tool) =>
      tool.name === META_TOOL_NAMES.call ||
      enabled.some((candidate) => candidate.name === tool.name),
  );
  return [...common, ...meta].sort((a, b) => a.name.localeCompare(b.name));
}

export function chatCatalogue(enabled: readonly HubTool[]): string {
  if (!discoveryAvailable(enabled)) {
    return rawCatalogue(enabled.filter((tool) => tool.origin.kind === 'plugin'));
  }
  return enabled
    .filter((tool) => tool.origin.kind === 'plugin')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => `${tool.name}: ${tool.title}`)
    .join('\n');
}

export function toolIndex(enabled: readonly HubTool[]): string {
  if (!discoveryAvailable(enabled)) {
    return rawCatalogue(enabled.filter((tool) => tool.origin.kind !== 'plugin'));
  }
  return enabled
    .filter(
      (tool) =>
        tool.origin.kind !== 'plugin' &&
        !COMMON_TOOL_NAMES.has(tool.name) &&
        !META_TOOLS.some((meta) => meta.name === tool.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (tool) =>
        `${tool.name} (${MCP_TOOLS.find((entry) => entry.name === tool.name)?.area ?? tool.origin.kind})`,
    )
    .join('\n');
}

function declarationAvailable(tool: ToolSpec): boolean {
  try {
    portableSchemaOf(tool.inputSchema);
    return true;
  } catch (cause) {
    if (cause instanceof ToolSchemaReferenceError) {
      return false;
    }
    throw cause;
  }
}

function rawCatalogue(tools: readonly HubTool[]): string {
  return tools
    .filter((tool) => !declarationAvailable(tool))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => JSON.stringify(tool))
    .join('\n');
}
