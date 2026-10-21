import {
  MCP_DISCOVERY_TOOLS,
  MCP_TOOL_AREAS,
  MCP_TOOLS,
  mcpToolLine,
  type McpToolArea,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HubTool, ToolSpec } from './hub-tool';
import { rankOperations, rankTools } from './tool-search';

const SEARCH_PAGE_MAX = 50;
const OPERATION_HITS = 5;
const CURSOR = /^(0|[1-9][0-9]*)$/u;

export const SEARCH_TOOLS_INPUT = z
  .strictObject({
    query: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe('What you want to do, in your own words; any word can match a tool or operation'),
    area: z
      .enum(MCP_TOOL_AREAS)
      .optional()
      .describe('Only API operations of this part of the app; alone it lists them all'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SEARCH_PAGE_MAX)
      .default(10)
      .describe(`Tools per page, at most ${String(SEARCH_PAGE_MAX)}`),
    cursor: z.string().trim().min(1).optional().describe('nextCursor of the previous page'),
  })
  .refine((input) => input.query !== undefined || input.area !== undefined, {
    message: 'give query, area or both',
    path: ['query'],
  });

export const TOOL_DETAILS_INPUT = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .describe('A tool name, an API operation name (camelCase) or a shared schema name'),
  variant: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('For a tool with an action or view: that value’s own schema'),
  responses: z.boolean().default(false).describe('For an API operation: also its response schema'),
});

export const CALL_TOOL_INPUT = z.strictObject({
  name: z.string().trim().min(1).describe('An enabled tool name'),
  arguments: z.record(z.string(), z.unknown()).describe('Arguments matching tool_read'),
});

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
  return new Set(disabled.filter((name) => !MCP_DISCOVERY_TOOLS.has(name)));
}

export interface DiscoverableTool extends ToolSpec {
  readonly title?: string;
  readonly annotations?: HubTool['annotations'];
}

export interface OperationLookup {
  readonly details: (name: string, responses: boolean) => Readonly<Record<string, unknown>>;
  readonly ofArea: (area: McpToolArea) => readonly Readonly<Record<string, unknown>>[];
  readonly inScope: (area: McpToolArea) => boolean;
}

export interface SearchScope {
  readonly operations?: OperationLookup;
  readonly schema?: (name: string) => Readonly<Record<string, unknown>> | undefined;
  readonly examples?: (name: string) => readonly object[] | undefined;
}

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!CURSOR.test(cursor)) {
    throw new ToolDiscoveryError('cursor must be a nextCursor from tool_search');
  }
  return Number(cursor);
}

const SERVED_LINES: ReadonlyMap<string, string> = new Map(
  MCP_TOOLS.map((tool) => [tool.name, tool.line]),
);

function lineOf(tool: DiscoverableTool): string {
  return SERVED_LINES.get(tool.name) ?? mcpToolLine(tool.description);
}

function operationsCallable(tools: readonly DiscoverableTool[], scope: SearchScope): boolean {
  return scope.operations !== undefined && tools.some((tool) => tool.name === 'operation_call');
}

function operationHits(
  query: string | undefined,
  area: McpToolArea | undefined,
  lookup: OperationLookup,
): readonly unknown[] {
  if (query === undefined) {
    return area === undefined ? [] : lookup.ofArea(area);
  }
  const inScope = (found: McpToolArea): boolean =>
    lookup.inScope(found) && (area === undefined || found === area);
  return rankOperations(query, inScope).slice(0, OPERATION_HITS);
}

export function searchTools(
  tools: readonly DiscoverableTool[],
  raw: unknown,
  scope: SearchScope = {},
): Readonly<Record<string, unknown>> {
  const { query, area, limit, cursor } = discoveryInput(SEARCH_TOOLS_INPUT, raw);
  const offset = offsetOf(cursor);
  const found = query === undefined ? [] : rankTools(tools, query);
  const next = offset + limit;
  const lookup = operationsCallable(tools, scope) ? scope.operations : undefined;
  const operations =
    lookup === undefined
      ? {}
      : { operations: offset === 0 ? operationHits(query, area, lookup) : [] };
  return {
    tools: found.slice(offset, next).map((tool) => ({
      name: tool.name,
      title: tool.title,
      line: lineOf(tool),
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

function detailsOfTool(
  tool: DiscoverableTool,
  variant: string | undefined,
  scope: SearchScope,
): Readonly<Record<string, unknown>> {
  const examples = scope.examples?.(tool.name);
  return {
    ...(examples === undefined ? {} : { inputExamples: examples }),
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

const OPERATION_NAME = /^[a-z]+[A-Z][A-Za-z0-9]*$/u;

export function toolDetails(
  tools: readonly DiscoverableTool[],
  raw: unknown,
  scope: SearchScope = {},
): Readonly<Record<string, unknown>> {
  const { name, variant, responses } = discoveryInput(TOOL_DETAILS_INPUT, raw);
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool !== undefined) {
    return detailsOfTool(tool, variant, scope);
  }
  const schema = scope.schema?.(name);
  if (schema !== undefined) {
    return { schema: { name, inputSchema: schema } };
  }
  if (
    OPERATION_NAME.test(name) &&
    operationsCallable(tools, scope) &&
    scope.operations !== undefined
  ) {
    return { operation: scope.operations.details(name, responses) };
  }
  throw new ToolDiscoveryError(
    `There is no enabled tool, API operation or shared schema named ${name} in this scope; tool_search finds them`,
    'not_found',
  );
}
