import {
  MCP_ROUTES,
  MCP_TOOL_NAMES,
  isMcpToolName,
  type McpRoute,
  type McpToolName,
} from '@smarteverything/domain';
import { AI_MODEL_TOOLS } from './ai-models';
import { AI_USAGE_TOOLS } from './ai-usage';
import { ASSISTANT_TOOLS } from './assistant';
import { CAMERA_TOOLS } from './camera';
import { CONTROL_TOOLS } from './control';
import { DEVICE_TOOLS } from './devices';
import { HEALTH_TOOLS } from './health';
import { HEALTH_SUMMARY_TOOL } from './health-summary';
import { HISTORY_TOOLS } from './history';
import { HOME_TOOLS } from './home';
import { NUTRITION_TOOLS } from './nutrition';
import { OPERATION_TOOLS } from './operation-tools';
import { PEOPLE_TOOLS } from './people';
import { PLACE_TOOLS } from './places';
import { ToolError, type Tool } from './registry';
import { discoveryTools } from './discovery';
import { partCall, servedTool, type PartCall } from './served';
import { REMOTE_TOOLS } from './remotes';
import { SEARCH_TOOL } from './search';
import { SETTINGS_TOOLS } from './settings';
import { WEATHER_TOOLS } from './weather';

const PARTS: readonly Tool[] = [
  ...HOME_TOOLS,
  ...DEVICE_TOOLS,
  SEARCH_TOOL,
  ...REMOTE_TOOLS,
  ...CONTROL_TOOLS,
  ...HISTORY_TOOLS,
  HEALTH_SUMMARY_TOOL,
  ...HEALTH_TOOLS,
  ...NUTRITION_TOOLS,
  ...CAMERA_TOOLS,
  ...SETTINGS_TOOLS,
  ...PEOPLE_TOOLS,
  ...WEATHER_TOOLS,
  ...PLACE_TOOLS,
  ...ASSISTANT_TOOLS,
  ...AI_USAGE_TOOLS,
  ...AI_MODEL_TOOLS,
  ...OPERATION_TOOLS,
];

const PART_BY_NAME: ReadonlyMap<string, Tool> = new Map(PARTS.map((tool) => [tool.name, tool]));

const CUSTOM: ReadonlyMap<string, Tool> = new Map(
  discoveryTools(() => TOOLS).map((tool) => [tool.name, tool]),
);

export const TOOLS: readonly Tool[] = MCP_TOOL_NAMES.map((name) =>
  servedTool(name, routeOf(name), PART_BY_NAME, CUSTOM),
);

const BY_NAME: ReadonlyMap<string, Tool> = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function toolNamed(name: string): Tool | undefined {
  return BY_NAME.get(name);
}

function routeOf(name: McpToolName): McpRoute {
  const route = MCP_ROUTES.get(name);
  if (route === undefined) {
    throw new ToolError(`The tool ${name} has no route`, 'internal');
  }
  return route;
}

export function partCallOf(name: string, args: Readonly<Record<string, unknown>>): PartCall {
  return isMcpToolName(name) ? partCall(routeOf(name), name, args) : { name, args };
}
