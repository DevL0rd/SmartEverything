import { scopedToolCall } from './authority';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { McpPartName, PluginRequester } from '@smarteverything/domain';
import { describeFailure, redactText } from '@smarteverything/logging';
import { z } from 'zod';
import type { Clock } from '../../../clock';
import type { RunningHub } from '../../../hub';
import type { Operations } from '../../../server/operations';
import type { Store } from '../../../store/store';
import type { MediaNotes } from '../../../transcripts/media-notes';
import type { AcceptedCaller } from '../bearer';
import { ID_SOURCES } from './field-texts';

export interface ToolImage {
  readonly data: string;
  readonly mimeType: string;
}

export interface ToolActor {
  readonly authority?: ConversationAuthority;
  readonly clientId: string | null;
  readonly profileId: string;
  readonly role?: 'owner' | 'member';
  readonly chatId: string | null;
  readonly callId?: string;
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
  readonly visibleTools?: () => readonly Tool[];
  readonly servedTool?: string;
}

export interface ToolOutput {
  readonly structured: Readonly<Record<string, unknown>>;
  readonly images?: readonly ToolImage[];
  readonly action?: boolean;
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
  readonly answer?: boolean;
  readonly run: (context: ToolContext, input: I) => Promise<ToolOutput> | ToolOutput;
}

export interface ToolListing {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: ToolAnnotations & { readonly title: string };
}

export interface Tool {
  readonly name: string;
  readonly listing: ToolListing;
  readonly input?: z.ZodType;
  readonly variants?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
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

export const PLUGIN_ONLY_TOOLS: ReadonlySet<string> = new Set(['inbox_post']);

const CALLER_NOUN: Readonly<Record<AcceptedCaller['via'], string>> = {
  plugin: 'This plugin',
  computer: 'This computer’s MCP grant',
  personal: 'This personal token',
  oauth: 'This assistant connection',
};

export function reachRefusal(caller: AcceptedCaller, what: string, area: string): ToolError {
  return new ToolError(
    `${CALLER_NOUN[caller.via]} does not include the ${area} area, so ${what} is not available; the owner chooses what it can reach.`,
    'forbidden',
  );
}

export function internalRefusal(cause: unknown): ToolError {
  const { name, message } = describeFailure(cause);
  return new ToolError(`${name}: ${redactText(message, INTERNAL_MESSAGE_SHOWN)}`, 'internal');
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

export const COMMANDS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
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

export function combinedAnnotations(all: readonly ToolAnnotations[]): ToolAnnotations {
  return {
    readOnlyHint: all.every((one) => one.readOnlyHint),
    destructiveHint: all.some((one) => one.destructiveHint),
    idempotentHint: all.every((one) => one.idempotentHint),
    openWorldHint: all.some((one) => one.openWorldHint),
  };
}

const MAXIMUM_ISSUES = 8;

const INTERNAL_MESSAGE_SHOWN = 400;

function nearestBranch(
  branches: readonly (readonly z.core.$ZodIssue[])[],
): readonly z.core.$ZodIssue[] {
  const depth = (issues: readonly z.core.$ZodIssue[]): number =>
    Math.min(...issues.map((issue) => issue.path.length));
  return branches.reduce((best, branch) => (depth(branch) > depth(best) ? branch : best));
}

function flattened(issues: readonly z.core.$ZodIssue[]): readonly z.core.$ZodIssue[] {
  return issues.flatMap((issue) =>
    issue.code === 'invalid_union' && issue.errors.length > 0
      ? flattened(
          nearestBranch(issue.errors).map((inner) => ({
            ...inner,
            path: [...issue.path, ...inner.path],
          })),
        )
      : [issue],
  );
}

function lastKey(path: readonly PropertyKey[]): string | undefined {
  return path.findLast((segment): segment is string => typeof segment === 'string');
}

function acceptedFields(input: z.ZodType | undefined): string {
  return input instanceof z.ZodObject ? `; it takes: ${Object.keys(input.shape).join(', ')}` : '';
}

function correction(issue: z.core.$ZodIssue, input: z.ZodType | undefined): string {
  if (issue.code === 'unrecognized_keys' && issue.path.length === 0) {
    return acceptedFields(input);
  }
  if (issue.code === 'invalid_format' && issue.format === 'uuid') {
    const key = lastKey(issue.path);
    const source = key === undefined ? undefined : ID_SOURCES[key];
    return source === undefined ? '' : `: use the id ${source} gives`;
  }
  return '';
}

export function issuesOf(error: z.ZodError, input?: z.ZodType): string {
  const issues = flattened(error.issues);
  const shown = issues
    .slice(0, MAXIMUM_ISSUES)
    .map(
      (issue) =>
        `${issue.path.join('.') || 'arguments'} ${issue.message}${correction(issue, input)}`,
    );
  const hidden = issues.length - shown.length;
  return (hidden > 0 ? [...shown, `and ${String(hidden)} more`] : shown).join('; ');
}

export function listingOf(
  name: McpPartName,
  inputSchema: Readonly<Record<string, unknown>>,
  annotations: ToolAnnotations,
): ToolListing {
  return {
    name,
    title: name,
    description: '',
    inputSchema,
    annotations: { title: name, ...annotations },
  };
}

import { jsonSchemaOf } from './json-schema';
export { inlineSchemaOf, jsonSchemaOf } from './json-schema';

export function argumentIssues(input: z.ZodType, raw: unknown): string | null {
  const parsed = input.safeParse(raw);
  return parsed.success ? null : `The arguments are not valid: ${issuesOf(parsed.error, input)}`;
}

export function validArguments<I>(input: z.ZodType<I>, raw: unknown): I {
  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    throw new ToolError(`The arguments are not valid: ${issuesOf(parsed.error, input)}`);
  }
  return parsed.data;
}

export function defineTool<I>(definition: ToolDefinition<I>): Tool {
  return {
    name: definition.name,
    input: definition.input,
    listing: listingOf(
      definition.name,
      jsonSchemaOf(definition.input, 'input'),
      definition.annotations,
    ),
    check: (_context, raw): string | null => argumentIssues(definition.input, raw),
    call: async (context, raw): Promise<ToolOutput> => {
      const input = validArguments(definition.input, raw);
      const output = await scopedToolCall(context, definition.name, (scoped) =>
        definition.run(scoped, input),
      );
      return {
        action: !definition.annotations.readOnlyHint && definition.answer !== true,
        ...output,
      };
    },
  };
}

export function matches(words: string, ...fields: readonly (string | null)[]): boolean {
  const lowered = fields.map((field) => field?.toLowerCase().replaceAll('_', ' '));
  return words
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '')
    .every((word) => lowered.some((field) => field?.includes(word) === true));
}

export const MOMENT_ARGUMENT = z.iso
  .datetime({ offset: true })
  .transform((text) => new Date(text).toISOString());

export const PERSON = z
  .uuid()
  .optional()
  .describe('Whose data: a person id from person_read; the owner’s profile when left out');
