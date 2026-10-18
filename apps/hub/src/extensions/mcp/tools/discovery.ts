import { z } from 'zod';
import {
  SEARCH_TOOLS_INPUT,
  TOOL_DETAILS_INPUT,
  ToolDiscoveryError,
  type DiscoverableTool,
  type SearchScope,
  searchTools,
  toolDetails,
} from '../../../ai-tools/tool-discovery';
import { scopedToolCall } from './authority';
import { reachableAreas } from './person-reach';
import { READS, ToolError, issuesOf, jsonSchemaOf, type Tool, type ToolContext } from './registry';
import { visibleTools } from './visibility';
import { servedListing } from './served';

const LISTED = z.looseObject({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z.looseObject({
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean(),
    openWorldHint: z.boolean(),
  }),
});

function discoverable(tool: Tool): DiscoverableTool {
  return {
    ...LISTED.parse(tool.listing),
    ...(tool.variants === undefined ? {} : { variants: tool.variants }),
  };
}

function discovered(
  run: () => Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  try {
    return run();
  } catch (cause) {
    if (cause instanceof ToolDiscoveryError) {
      throw new ToolError(cause.message, cause.code);
    }
    throw cause;
  }
}

function searchScope(context: ToolContext): SearchScope {
  const areas = reachableAreas(context);
  return areas === undefined ? {} : { operationInScope: (area) => areas.includes(area) };
}

export function discoveryTools(served: () => readonly Tool[]): Tool[] {
  return [
    {
      name: 'search_tools',
      listing: servedListing('search_tools', jsonSchemaOf(SEARCH_TOOLS_INPUT, 'input'), READS),
      check: (_context, raw): string | null => {
        const result = SEARCH_TOOLS_INPUT.safeParse(raw);
        return result.success ? null : issuesOf(result.error);
      },
      call: async (context, raw) =>
        await scopedToolCall(context, 'search_tools', (scoped) => ({
          structured: discovered(() =>
            searchTools(
              (scoped.visibleTools?.() ?? visibleTools(served(), scoped)).map(discoverable),
              raw,
              searchScope(scoped),
            ),
          ),
        })),
    },
    {
      name: 'tool_details',
      listing: servedListing('tool_details', jsonSchemaOf(TOOL_DETAILS_INPUT, 'input'), READS),
      check: (_context, raw): string | null => {
        const result = TOOL_DETAILS_INPUT.safeParse(raw);
        return result.success ? null : issuesOf(result.error);
      },
      call: async (context, raw) =>
        await scopedToolCall(context, 'tool_details', (scoped) => ({
          structured: discovered(() =>
            toolDetails(
              (scoped.visibleTools?.() ?? visibleTools(served(), scoped)).map(discoverable),
              raw,
            ),
          ),
        })),
    },
  ];
}
