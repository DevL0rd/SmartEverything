import { MCP_TOOLS } from '@smarteverything/domain';
import type { Tool, ToolContext } from './registry';

const SCOPED_DISPATCH_TOOLS: ReadonlySet<string> = new Set([
  'search_tools',
  'tool_details',
  'list_operations',
  'call_operation',
]);

export function toolInScope(context: ToolContext, name: string): boolean {
  const areas = context.caller?.areas;
  if (areas === undefined) {
    return true;
  }
  if (SCOPED_DISPATCH_TOOLS.has(name)) {
    return areas.length > 0;
  }
  const text = MCP_TOOLS.find((candidate) => candidate.name === name);
  return text !== undefined && areas.includes(text.area);
}

export function visibleTools(tools: readonly Tool[], context: ToolContext): readonly Tool[] {
  const off = new Set(context.store.settings.read().mcp_disabled_tools);
  return tools.filter((tool) => !off.has(tool.name) && toolInScope(context, tool.name));
}
