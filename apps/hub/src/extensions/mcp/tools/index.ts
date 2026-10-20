import { DEVICE_GROUP_TOOLS } from './device-groups';
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
import { CLAUDE_TOOLS } from './claude';
import { COMPUTER_CONTROL_TOOLS } from './computer-controls';
import { COMPUTER_INPUT_TOOLS } from './computer-input';
import { EDIT_FILES_TOOL } from './computer-files-tool';
import { COMPUTER_PROGRAM_TOOLS } from './computer-programs';
import { COMPUTER_READ_TOOLS } from './computer-reads';
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
import { outcomeOf } from './outcome';
import { ToolError, type Tool, type ToolOutput } from './registry';
import { discoveryTools } from './discovery';
import { partCall, servedTool, type PartCall } from './served';
import { REMOTE_TOOLS } from './remotes';
import { SEARCH_TOOL } from './search';
import { SEE_TOOL } from './see';
import { SETTINGS_TOOLS } from './settings';
import { WEATHER_TOOLS } from './weather';

const PARTS: readonly Tool[] = [
  ...DEVICE_GROUP_TOOLS,
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
  SEE_TOOL,
  ...SETTINGS_TOOLS,
  ...PEOPLE_TOOLS,
  ...WEATHER_TOOLS,
  ...PLACE_TOOLS,
  ...ASSISTANT_TOOLS,
  ...AI_USAGE_TOOLS,
  ...AI_MODEL_TOOLS,
  ...COMPUTER_READ_TOOLS,
  ...COMPUTER_PROGRAM_TOOLS,
  ...COMPUTER_CONTROL_TOOLS,
  ...COMPUTER_INPUT_TOOLS,
  EDIT_FILES_TOOL,
  ...OPERATION_TOOLS,
  ...CLAUDE_TOOLS,
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

export function shownOutput(
  name: string,
  args: Readonly<Record<string, unknown>>,
  output: ToolOutput,
): ToolOutput {
  if (output.action !== true || output.images !== undefined) return output;
  return { structured: outcomeOf(partCallOf(name, args).name, output.structured) };
}
