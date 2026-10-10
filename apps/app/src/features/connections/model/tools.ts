import {
  MCP_TOOLS,
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  isMcpToolName,
  type McpToolArea,
  type McpToolName,
  type McpToolSummary,
} from '@smarteverything/domain';

export interface ToolGroup {
  readonly area: McpToolArea;
  readonly title: string;
  readonly tools: readonly McpToolSummary<McpToolName>[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = MCP_TOOL_AREAS.map((area) => ({
  area,
  title: MCP_TOOL_AREA_LABELS[area],
  tools: MCP_TOOLS.filter((tool) => tool.area === area),
})).filter((group) => group.tools.length > 0);

export type GroupState = 'on' | 'off' | 'mixed';

export function groupState(group: ToolGroup, disabled: readonly string[]): GroupState {
  const off = group.tools.filter((tool) => disabled.includes(tool.name)).length;
  if (off === 0) {
    return 'on';
  }
  return off === group.tools.length ? 'off' : 'mixed';
}

export function withGroup(
  disabled: readonly string[],
  group: ToolGroup,
  on: boolean,
): readonly string[] {
  const names: readonly string[] = group.tools.map((tool) => tool.name);
  const rest = disabled.filter((name) => !names.includes(name));
  return on ? rest : [...rest, ...names];
}

export function withTool(
  disabled: readonly string[],
  name: string,
  on: boolean,
): readonly string[] {
  const rest = disabled.filter((item) => item !== name);
  return on ? rest : [...rest, name];
}

export function toolsSummary(disabled: readonly string[]): string {
  const total = MCP_TOOLS.length;
  const on = total - disabled.filter(isMcpToolName).length;
  return on === total ? `All ${String(total)} on` : `${String(on)} of ${String(total)} on`;
}
