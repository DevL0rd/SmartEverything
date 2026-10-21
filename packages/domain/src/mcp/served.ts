import { z } from 'zod';
import type { McpToolSummary } from './areas';
import type { McpPartName } from './names';
import { SERVED_ASSISTANT } from './served-assistant';
import { SERVED_AUTOMATIONS } from './served-automations';
import { SERVED_CAMERAS } from './served-cameras';
import { SERVED_COMPUTERS } from './served-computers';
import { SERVED_HOME } from './served-home';
import { SERVED_IMAGES } from './served-images';
import { SERVED_LIFE } from './served-life';
import { SERVED_PLUGINS } from './served-plugins';
import { SERVED_PROJECTS } from './served-projects';
import type { McpRoute } from './served-types';

export type { McpBranch, McpRoute, McpSelector, Served } from './served-types';

const SERVED = [
  ...SERVED_HOME,
  ...SERVED_CAMERAS,
  ...SERVED_AUTOMATIONS,
  ...SERVED_LIFE,
  ...SERVED_PROJECTS,
  ...SERVED_IMAGES,
  ...SERVED_ASSISTANT,
  ...SERVED_COMPUTERS,
  ...SERVED_PLUGINS,
] as const;

export type McpToolName = (typeof SERVED)[number]['name'];

export const MCP_TOOL_NAMES: readonly McpToolName[] = SERVED.map((tool) => tool.name);

export const MCP_TOOL_NAME = z.enum(MCP_TOOL_NAMES);

const KNOWN: ReadonlySet<string> = new Set(MCP_TOOL_NAMES);

export function isMcpToolName(name: string): name is McpToolName {
  return KNOWN.has(name);
}

export const MCP_DISCOVERY_TOOLS: ReadonlySet<string> = new Set<McpToolName>([
  'tool_search',
  'tool_read',
]);

export const MCP_TOOLS: readonly McpToolSummary<McpToolName>[] = SERVED.map(
  ({ name, area, access, title, line, description }) => ({
    name,
    area,
    access,
    title,
    line,
    description,
  }),
);

export const MCP_ROUTES: ReadonlyMap<McpToolName, McpRoute> = new Map(
  SERVED.map((tool) => [tool.name, tool.route]),
);

export function partsOf(route: McpRoute): McpPartName[] {
  if ('part' in route) {
    return [route.part];
  }
  if ('compose' in route) {
    return [...route.compose];
  }
  return 'branches' in route ? Object.values(route.branches).map((branch) => branch.part) : [];
}
