import {
  MCP_TOOLS,
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  type AiChatRow,
  type McpToolArea,
} from '@smarteverything/domain';

type Tool = (typeof MCP_TOOLS)[number];

export interface ToolGroup {
  readonly area: McpToolArea;
  readonly title: string;
  readonly tools: readonly Tool[];
}

export interface ToolsState {
  readonly on: number;
  readonly total: number;
  readonly all: boolean;
  readonly mixed: boolean;
}

export const TOOL_GROUPS: readonly ToolGroup[] = MCP_TOOL_AREAS.map((area) => ({
  area,
  title: MCP_TOOL_AREA_LABELS[area],
  tools: MCP_TOOLS.filter((tool) => tool.area === area),
})).filter((group) => group.tools.length > 0);

const ALL_NAMES: readonly string[] = MCP_TOOLS.map((tool) => tool.name);

export function allowedOf(chat: Pick<AiChatRow, 'tools'>): readonly string[] {
  return chat.tools ?? ALL_NAMES;
}

export function stateOf(allowed: readonly string[], tools: readonly Tool[]): ToolsState {
  const on = tools.filter((tool) => allowed.includes(tool.name)).length;
  return { on, total: tools.length, all: on === tools.length, mixed: on > 0 && on < tools.length };
}

export function toolsLabel(chat: Pick<AiChatRow, 'tools'>): string {
  const { on, total, all } = stateOf(allowedOf(chat), MCP_TOOLS);
  return all ? 'All tools' : `${String(on)} of ${String(total)} tools`;
}

export function stored(allowed: readonly string[]): string[] | null {
  return ALL_NAMES.every((name) => allowed.includes(name)) ? null : [...allowed];
}

export function withTool(allowed: readonly string[], name: string, on: boolean): readonly string[] {
  const rest = allowed.filter((item) => item !== name);
  return on ? [...rest, name] : rest;
}

export function withTools(
  allowed: readonly string[],
  tools: readonly Tool[],
  on: boolean,
): readonly string[] {
  const names: readonly string[] = tools.map((tool) => tool.name);
  const rest = allowed.filter((name) => !names.includes(name));
  return on ? [...rest, ...names] : rest;
}
