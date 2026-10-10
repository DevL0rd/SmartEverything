import { z } from 'zod';
import type { McpToolSummary } from './areas';
import { MCP_OPERATION_TOOLS, type McpPartName } from './names';
import { MCP_CONFIRMED_OPERATIONS } from './operations';
import { SERVED_AI } from './served-ai';
import { SERVED_HOME } from './served-home';
import { SERVED_LIFE } from './served-life';
import type { McpRoute } from './served-types';

export type { McpRoute } from './served-types';

const SERVED = [...SERVED_HOME, ...SERVED_LIFE, ...SERVED_AI] as const;

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

const CONFIRMED_PARTS: ReadonlySet<string> = new Set(
  MCP_OPERATION_TOOLS.filter(([, operation]) => MCP_CONFIRMED_OPERATIONS.has(operation)).map(
    ([name]) => name,
  ),
);

export const MCP_ASKING_TOOLS: ReadonlySet<McpToolName> = new Set(
  [...MCP_ROUTES].flatMap(([name, route]) =>
    partsOf(route).some((part) => CONFIRMED_PARTS.has(part)) ? [name] : [],
  ),
);
