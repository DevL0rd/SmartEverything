import { z } from 'zod';
import type { HubTool, ToolSpec } from './hub-tool';

export const SEARCH_TOOLS_INPUT = z.strictObject({
  query: z.string().trim().min(1).max(100).describe('Words in a tool’s name, title or description'),
  limit: z.number().int().min(1).max(50).default(10),
});

export const TOOL_DETAILS_INPUT = z.strictObject({ name: z.string().trim().min(1) });

export const CALL_TOOL_INPUT = z.strictObject({
  name: z.string().trim().min(1).describe('An enabled tool name'),
  arguments: z.record(z.string(), z.unknown()).describe('Arguments matching tool_details'),
});

export const DISCOVERY_NAMES: ReadonlySet<string> = new Set(['search_tools', 'tool_details']);

export class ToolDiscoveryError extends Error {
  override readonly name = 'ToolDiscoveryError';
}

export function discoveryInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'} ${issue.message}`)
      .join('; ');
    throw new ToolDiscoveryError(`invalid_request: ${issues}`);
  }
  return parsed.data;
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-./:]+/u)
    .filter((word) => word !== '');
}

export interface DiscoverableTool extends ToolSpec {
  readonly title?: string;
  readonly annotations?: HubTool['annotations'];
}

export function searchTools(
  tools: readonly DiscoverableTool[],
  raw: unknown,
): Readonly<Record<string, unknown>> {
  const { query, limit } = discoveryInput(SEARCH_TOOLS_INPUT, raw);
  const words = wordsOf(query);
  const found = tools
    .filter((tool) => {
      const fields = wordsOf([tool.name, tool.title ?? '', tool.description].join(' '));
      return words.every((word) => fields.some((field) => field.includes(word)));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    tools: found.slice(0, limit).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
    })),
    count: found.length,
    hasMore: found.length > limit,
  };
}

export function toolDetails(
  tools: readonly DiscoverableTool[],
  raw: unknown,
): Readonly<Record<string, unknown>> {
  const { name } = discoveryInput(TOOL_DETAILS_INPUT, raw);
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new ToolDiscoveryError(`There is no enabled tool named ${name} in this scope`);
  }
  return { tool };
}
