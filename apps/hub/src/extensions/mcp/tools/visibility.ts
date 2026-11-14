import { MCP_TOOLS } from '@smarteverything/domain';
import { switchedOffTools } from '../../../ai-tools/tool-discovery';
import { reachableAreas } from './person-reach';
import { readOnlyCaller } from './read-only';
import { OWNER_UPDATE_TOOLS, ownerUpdateRequester } from './update-requester';
import type { Tool, ToolContext } from './registry';

const SCOPED_DISPATCH_TOOLS: ReadonlySet<string> = new Set([
  'tool_search',
  'tool_read',
  'operation_call',
]);

export function toolInScope(
  context: Pick<ToolContext, 'store' | 'actor' | 'caller'>,
  name: string,
): boolean {
  const areas = reachableAreas(context);
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
  const off = switchedOffTools(context.store.settings.read().mcp_disabled_tools);
  const readOnly = readOnlyCaller(context);
  return tools.filter(
    (tool) =>
      !off.has(tool.name) &&
      toolInScope(context, tool.name) &&
      (!OWNER_UPDATE_TOOLS.has(tool.name) || ownerUpdateRequester(context) !== null) &&
      (!readOnly || tool.listing.annotations.readOnlyHint),
  );
}
