import { MCP_TOOLS, MCP_TOOL_NAME } from '@smarteverything/domain';
import { z } from 'zod';
import {
  READS,
  ToolError,
  issuesOf,
  jsonSchemaOf,
  matches,
  type Tool,
  type ToolOutput,
} from './registry';
import { servedListing } from './served';

const SEARCH = z.strictObject({
  query: z.string().min(1).max(100).describe('Words in the tool’s name, title or description'),
  limit: z.number().int().min(1).max(50).default(10),
});

const DETAILS = z.strictObject({ name: MCP_TOOL_NAME.describe('The tool’s name') });

function parsed<T>(schema: z.ZodType<T>, raw: Readonly<Record<string, unknown>>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ToolError(`The arguments are not valid: ${issuesOf(result.error)}`);
  }
  return result.data;
}

function searched(raw: Readonly<Record<string, unknown>>): ToolOutput {
  const input = parsed(SEARCH, raw);
  const words = input.query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  const found = MCP_TOOLS.filter((tool) =>
    words.every((word) => matches(word, tool.name, tool.title, tool.description)),
  );
  return {
    structured: {
      tools: found.slice(0, input.limit).map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
      })),
    },
  };
}

export function discoveryTools(served: () => readonly Tool[]): Tool[] {
  return [
    {
      name: 'search_tools',
      listing: servedListing('search_tools', jsonSchemaOf(SEARCH, 'input'), READS),
      check: (_context, raw): string | null => {
        const result = SEARCH.safeParse(raw);
        return result.success ? null : issuesOf(result.error);
      },
      call: (_context, raw): Promise<ToolOutput> => Promise.resolve(searched(raw)),
    },
    {
      name: 'tool_details',
      listing: servedListing('tool_details', jsonSchemaOf(DETAILS, 'input'), READS),
      check: (_context, raw): string | null => {
        const result = DETAILS.safeParse(raw);
        return result.success ? null : issuesOf(result.error);
      },
      call: (_context, raw): Promise<ToolOutput> => {
        const { name } = parsed(DETAILS, raw);
        const tool = served().find((candidate) => candidate.name === name);
        return Promise.resolve({ structured: { tool: tool?.listing ?? null } });
      },
    },
  ];
}
