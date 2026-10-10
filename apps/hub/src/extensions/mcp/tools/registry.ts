import { MCP_PART_TEXTS, type McpPartName, type PluginRequester } from '@smarteverything/domain';
import { z } from 'zod';
import type { Clock } from '../../../clock';
import type { RunningHub } from '../../../hub';
import type { Operations } from '../../../server/operations';
import type { Store } from '../../../store/store';
import type { MediaNotes } from '../../../transcripts/media-notes';
import type { AcceptedCaller } from '../bearer';

export interface ToolImage {
  readonly data: string;
  readonly mimeType: string;
}

export interface ToolActor {
  readonly clientId: string | null;
  readonly profileId: string;
  readonly chatId: string | null;
  readonly pluginRequester?: PluginRequester;
  readonly pluginId?: string;
}

export interface ToolContext {
  readonly store: Store;
  readonly hub: RunningHub;
  readonly clock: Clock;
  readonly operations: Operations;
  readonly commandWaitMs: number;
  readonly recordingPath: (storagePath: string) => string;
  readonly caller: AcceptedCaller | null;
  readonly assistantFiles: string;
  readonly mediaNotes: MediaNotes;
  readonly actor: ToolActor | null;
}

export interface ToolOutput {
  readonly structured: Readonly<Record<string, unknown>>;
  readonly images?: readonly ToolImage[];
}

export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export interface ToolDefinition<I> {
  readonly name: McpPartName;
  readonly input: z.ZodType<I>;
  readonly annotations: ToolAnnotations;
  readonly run: (context: ToolContext, input: I) => Promise<ToolOutput> | ToolOutput;
}

export interface Tool {
  readonly name: string;
  readonly listing: Readonly<Record<string, unknown>>;
  readonly call: (
    context: ToolContext,
    raw: Readonly<Record<string, unknown>>,
  ) => Promise<ToolOutput>;
  readonly check: (context: ToolContext, raw: Readonly<Record<string, unknown>>) => string | null;
}

export class ToolError extends Error {
  override readonly name = 'ToolError';

  constructor(
    message: string,
    readonly code = 'invalid_request',
  ) {
    super(message);
  }
}

class UnknownToolTextError extends Error {
  override readonly name = 'UnknownToolTextError';

  constructor(name: string) {
    super(`The tool ${name} has no entry in MCP_PART_TEXTS; every tool must be described there.`);
  }
}

export const READS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const PHYSICAL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export const WRITES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const REMOVES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export function issuesOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'arguments'} ${issue.message}`)
    .join('; ');
}

export function listingOf(
  name: McpPartName,
  inputSchema: Readonly<Record<string, unknown>>,
  annotations: ToolAnnotations,
): Readonly<Record<string, unknown>> {
  const text = MCP_PART_TEXTS.find((candidate) => candidate.name === name);
  if (text === undefined) {
    throw new UnknownToolTextError(name);
  }
  return {
    name,
    title: text.title,
    description: text.description,
    inputSchema,
    annotations: { title: text.title, ...annotations },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compact);
  }
  if (!isRecord(value)) {
    return value;
  }
  const formatted = typeof value['format'] === 'string';
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema' && !(formatted && key === 'pattern'))
      .map(([key, entry]) => [key, compact(entry)]),
  );
}

export function jsonSchemaOf(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const compacted = compact(z.toJSONSchema(schema, { io, unrepresentable: 'any' }));
  if (!isRecord(compacted)) {
    throw new ToolError('A JSON schema was not an object', 'internal');
  }
  return { ...compacted };
}

export function defineTool<I>(definition: ToolDefinition<I>): Tool {
  return {
    name: definition.name,
    listing: listingOf(
      definition.name,
      jsonSchemaOf(definition.input, 'input'),
      definition.annotations,
    ),
    check: (_context, raw): string | null => {
      const parsed = definition.input.safeParse(raw);
      return parsed.success ? null : `The arguments are not valid: ${issuesOf(parsed.error)}`;
    },
    call: async (context, raw): Promise<ToolOutput> => {
      const parsed = definition.input.safeParse(raw);
      if (!parsed.success) {
        throw new ToolError(`The arguments are not valid: ${issuesOf(parsed.error)}`);
      }
      return definition.run(context, parsed.data);
    },
  };
}

export function matches(words: string, ...fields: readonly (string | null)[]): boolean {
  const wanted = words.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(wanted) === true);
}

export const MOMENT_ARGUMENT = z.iso
  .datetime({ offset: true })
  .transform((text) => new Date(text).toISOString());

export const PROFILE = z
  .uuid()
  .optional()
  .describe('Whose data: a person id from list_people; the owner’s profile when left out');
