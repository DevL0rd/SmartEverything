import { z } from 'zod';
import {
  SEARCH_TOOLS_INPUT,
  TOOL_DETAILS_INPUT,
  ToolDiscoveryError,
  searchTools,
  toolDetails,
} from '../../../ai-tools/tool-discovery';
import { READS, ToolError, issuesOf, jsonSchemaOf, type Tool } from './registry';
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

function discovered(
  run: () => Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  try {
    return run();
  } catch (cause) {
    if (cause instanceof ToolDiscoveryError) {
      throw new ToolError(cause.message);
    }
    throw cause;
  }
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
      call: (context, raw) =>
        Promise.resolve({
          structured: discovered(() =>
            searchTools(
              (context.visibleTools?.() ?? visibleTools(served(), context)).map((tool) =>
                LISTED.parse(tool.listing),
              ),
              raw,
            ),
          ),
        }),
    },
    {
      name: 'tool_details',
      listing: servedListing('tool_details', jsonSchemaOf(TOOL_DETAILS_INPUT, 'input'), READS),
      check: (_context, raw): string | null => {
        const result = TOOL_DETAILS_INPUT.safeParse(raw);
        return result.success ? null : issuesOf(result.error);
      },
      call: (context, raw) =>
        Promise.resolve({
          structured: discovered(() =>
            toolDetails(
              (context.visibleTools?.() ?? visibleTools(served(), context)).map((tool) => ({
                ...LISTED.parse(tool.listing),
                ...(tool.variants === undefined ? {} : { variants: tool.variants }),
              })),
              raw,
            ),
          ),
        }),
    },
  ];
}
