import { z } from 'zod';
import type { McpToolSummary } from './areas';
import type { McpPartName } from './names';
import { SERVED_CLAUDE } from './served-claude';
import { SERVED_AI } from './served-ai';
import { SERVED_HOME } from './served-home';
import { SERVED_LIFE } from './served-life';
import type { McpRoute } from './served-types';

export type { McpRoute } from './served-types';

const SERVED = [...SERVED_HOME, ...SERVED_LIFE, ...SERVED_AI, ...SERVED_CLAUDE] as const;

export type McpToolName = (typeof SERVED)[number][0];

export const MCP_TOOL_NAMES: readonly McpToolName[] = SERVED.map(([name]) => name);

export const MCP_TOOL_NAME = z.enum(MCP_TOOL_NAMES);

const KNOWN: ReadonlySet<string> = new Set(MCP_TOOL_NAMES);

export function isMcpToolName(name: string): name is McpToolName {
  return KNOWN.has(name);
}

export const MCP_ONLY_TOOLS: ReadonlySet<McpToolName> = new Set<McpToolName>([
  'search_tools',
  'tool_details',
]);

export const MCP_TOOLS: readonly McpToolSummary<McpToolName>[] = SERVED.map(
  ([name, area, access, title, description]) => ({ name, area, access, title, description }),
);

export const MCP_ROUTES: ReadonlyMap<McpToolName, McpRoute> = new Map(
  SERVED.map(([name, , , , , route]) => [name, route]),
);

export function partsOf(route: McpRoute): McpPartName[] {
  if ('part' in route) {
    return [route.part];
  }
  if ('compose' in route) {
    return [...route.compose];
  }
  return 'parts' in route ? Object.values(route.parts) : [];
}
