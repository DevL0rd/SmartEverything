import { z } from 'zod';
import type { McpToolArea } from '@smarteverything/domain';
import type { HubTool, ToolSpec } from './hub-tool';
import { rankOperations, rankTools, type SearchedOperation } from './tool-search';

const SEARCH_PAGE_MAX = 50;
const OPERATION_HITS = 5;
const CURSOR = /^(0|[1-9][0-9]*)$/u;

export const SEARCH_TOOLS_INPUT = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('What you want to do, in your own words; any word can match a tool'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_MAX)
    .default(10)
    .describe(`Tools per page, at most ${String(SEARCH_PAGE_MAX)}`),
  cursor: z.string().trim().min(1).optional().describe('nextCursor of the previous page'),
});

export const TOOL_DETAILS_INPUT = z.strictObject({
  name: z.string().trim().min(1),
  variant: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('For a tool with an action, view, area, what or kind: that value’s own schema'),
});

export const CALL_TOOL_INPUT = z.strictObject({
  name: z.string().trim().min(1).describe('An enabled tool name'),
  arguments: z.record(z.string(), z.unknown()).describe('Arguments matching tool_details'),
});

export const DISCOVERY_NAMES: ReadonlySet<string> = new Set(['search_tools', 'tool_details']);

export class ToolDiscoveryError extends Error {
  override readonly name = 'ToolDiscoveryError';

  constructor(
    message: string,
    readonly code = 'invalid_request',
  ) {
    super(message);
  }
}

export function discoveryInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'} ${issue.message}`)
      .join('; ');
    throw new ToolDiscoveryError(issues);
  }
  return parsed.data;
}

export function switchedOffTools(disabled: readonly string[]): ReadonlySet<string> {
  return new Set(disabled.filter((name) => !DISCOVERY_NAMES.has(name)));
}

export interface DiscoverableTool extends ToolSpec {
  readonly title?: string;
  readonly annotations?: HubTool['annotations'];
}

export interface SearchScope {
  readonly operationInScope?: (area: McpToolArea) => boolean;
}

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!CURSOR.test(cursor)) {
    throw new ToolDiscoveryError('cursor must be a nextCursor from search_tools');
  }
  return Number(cursor);
}

function firstOperations(
  query: string,
  offset: number,
  scope: SearchScope,
): readonly SearchedOperation[] {
  return offset > 0
    ? []
    : rankOperations(query, scope.operationInScope ?? ((): boolean => true)).slice(
        0,
        OPERATION_HITS,
      );
}

export function searchTools(
  tools: readonly DiscoverableTool[],
  raw: unknown,
  scope: SearchScope = {},
): Readonly<Record<string, unknown>> {
  const { query, limit, cursor } = discoveryInput(SEARCH_TOOLS_INPUT, raw);
  const offset = offsetOf(cursor);
  const found = rankTools(tools, query);
  const next = offset + limit;
  const operations = tools.some((tool) => tool.name === 'call_operation')
    ? { operations: firstOperations(query, offset, scope) }
    : {};
  return {
    tools: found.slice(offset, next).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
    })),
    count: found.length,
    hasMore: found.length > next,
    ...(found.length > next ? { nextCursor: String(next) } : {}),
    ...operations,
  };
}

function variantOf(tool: DiscoverableTool, selector: string): Readonly<Record<string, unknown>> {
  const variant = tool.variants?.get(selector);
  if (variant === undefined) {
    const known = [...(tool.variants?.keys() ?? [])];
    throw new ToolDiscoveryError(`variant must be one of: ${known.join(', ')}`);
  }
  return variant;
}

function variantPart(
  tool: DiscoverableTool,
  variant: string | undefined,
): Readonly<Record<string, unknown>> {
  if (variant === undefined) {
    return {};
  }
  if (tool.variants === undefined || tool.variants.size === 0) {
    return {
      note: `${tool.name} has no variants: tool.inputSchema and tool.description are everything you need to call it`,
    };
  }
  return { variant: variantOf(tool, variant) };
}

export function toolDetails(
  tools: readonly DiscoverableTool[],
  raw: unknown,
): Readonly<Record<string, unknown>> {
  const { name, variant } = discoveryInput(TOOL_DETAILS_INPUT, raw);
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new ToolDiscoveryError(
      `There is no enabled tool named ${name} in this scope`,
      'not_found',
    );
  }
  return {
    tool: {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    },
    ...variantPart(tool, variant),
  };
}
