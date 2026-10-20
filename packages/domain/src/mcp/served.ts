import { z } from 'zod';
import type { McpToolSummary } from './areas';
import type { McpPartName } from './names';
import { SERVED_CLAUDE } from './served-claude';
import { SERVED_IMAGES } from './served-images';
import { SERVED_PREVIEWS } from './served-previews';
import { SERVED_PROJECTS } from './served-projects';
import { SERVED_AI } from './served-ai';
import { SERVED_MACHINES } from './served-machines';
import { SERVED_TOOL_RESULTS } from './served-tool-results';
import { SERVED_AUTOMATION_PROGRAMS } from './served-automation-programs';
import { SERVED_HOME } from './served-home';
import { SERVED_LIFE } from './served-life';
import type { McpRoute } from './served-types';

export type { McpRoute } from './served-types';

const SERVED = [
  ...SERVED_HOME,
  ...SERVED_AUTOMATION_PROGRAMS,
  ...SERVED_LIFE,
  ...SERVED_PROJECTS,
  ...SERVED_PREVIEWS,
  ...SERVED_IMAGES,
  ...SERVED_AI,
  ...SERVED_MACHINES,
  ...SERVED_TOOL_RESULTS,
  ...SERVED_CLAUDE,
] as const;

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
