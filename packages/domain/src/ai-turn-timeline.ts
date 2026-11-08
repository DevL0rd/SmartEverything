import { z } from 'zod';
import { CHAT_TOOL_ITEM } from './ai-chats';
import { isUnknownArray } from './values';

export const CHAT_TIMELINE_TOOL = CHAT_TOOL_ITEM.extend({
  state: z.enum(['running', 'done', 'failed', 'interrupted', 'unknown']),
  input: z.string().nullable().default(null),
  output: z.string().nullable().default(null),
  redacted: z.boolean().default(false),
  image_operation_id: z.uuid().nullable().default(null),
  input_chars: z.int().nonnegative().optional(),
  output_chars: z.int().nonnegative().optional(),
});
export type ChatTimelineTool = z.infer<typeof CHAT_TIMELINE_TOOL>;
export const CHAT_TIMELINE_PART = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), key: z.string(), text: z.string() }),
  z.object({ kind: z.literal('reasoning'), key: z.string(), text: z.string() }),
  z.object({ kind: z.literal('tool'), key: z.string(), tool: CHAT_TIMELINE_TOOL }),
  z.object({ kind: z.literal('steer'), key: z.string(), message_id: z.uuid() }),
]);
export type ChatTimelinePart = z.infer<typeof CHAT_TIMELINE_PART>;
export const CHAT_TIMELINE_EMBED = z.object({
  kind: z.literal('chat_timeline'),
  version: z.literal(1),
  parts: z.array(CHAT_TIMELINE_PART),
});
export type ChatTimelineEmbed = z.infer<typeof CHAT_TIMELINE_EMBED>;

export const CHAT_TODO_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const CHAT_TODO_ITEM = z.object({
  content: z.string().trim().min(1),
  status: z.enum(CHAT_TODO_STATUSES),
});
export type ChatTodoItem = z.infer<typeof CHAT_TODO_ITEM>;
export const CHAT_TODOS_KIND = 'chat_todos';
export const CHAT_TODOS_EMBED = z.object({
  kind: z.literal(CHAT_TODOS_KIND),
  version: z.literal(1),
  items: z.array(CHAT_TODO_ITEM),
});
export type ChatTodosEmbed = z.infer<typeof CHAT_TODOS_EMBED>;
const TODO_WRITE_INPUT = z.object({ todos: z.array(CHAT_TODO_ITEM) });

export function chatTodosOf(toolName: string, input: unknown): ChatTodosEmbed | null {
  if (toolName !== TODO_TOOL_NAME) return null;
  const text =
    typeof input === 'string' ? input : input === undefined ? null : JSON.stringify(input);
  if (text === null) return null;
  const parsed = TODO_WRITE_INPUT.safeParse(parsedRecord(text));
  return parsed.success ? { kind: CHAT_TODOS_KIND, version: 1, items: parsed.data.todos } : null;
}

export function chatTodosIn(embeds: readonly { readonly kind: string }[]): ChatTodosEmbed | null {
  for (const embed of embeds) {
    if (embed.kind !== CHAT_TODOS_KIND) continue;
    const parsed = CHAT_TODOS_EMBED.safeParse(embed);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export const TIMELINE_FIELD_CHARS = 64_000;
export const TIMELINE_BUDGET_CHARS = 512_000;

export const TOOL_RESULT_PAGE_CHARS = 64_000;

export const TODO_TOOL_NAME = 'todo_write';
export const PLAN_TOOL_NAME = 'exit_plan_mode';
export const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set(['bash', 'pwsh']);

export const AI_TOOL_RESULT_FIELDS = ['output', 'input'] as const;
export const AI_TOOL_RESULT_PAGE = z.strictObject({
  call_id: z.string(),
  name: z.string(),
  field: z.enum(AI_TOOL_RESULT_FIELDS),
  cursor: z.string(),
  total_chars: z.int().nonnegative(),
  text: z.string(),
  nextCursor: z.string().nullable(),
});
export type AiToolResultPage = z.infer<typeof AI_TOOL_RESULT_PAGE>;

function clipped(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const splitsPair = /[\uD800-\uDBFF]/.test(value.charAt(limit - 1));
  return value.slice(0, splitsPair ? (limit > 1 ? limit - 1 : 2) : limit);
}

export function toolResultPage(
  tool: ChatTimelineTool,
  field: (typeof AI_TOOL_RESULT_FIELDS)[number],
  cursor: string | undefined,
  limit: number,
): AiToolResultPage {
  const full = tool[field] ?? '';
  const start = Math.min(cursor === undefined ? 0 : Number(cursor), full.length);
  const text = clipped(full.slice(start), limit);
  const end = start + text.length;
  return {
    call_id: tool.callId,
    name: tool.name,
    field,
    cursor: String(start),
    total_chars: full.length,
    text,
    nextCursor: end < full.length ? String(end) : null,
  };
}

function fullLength(value: string | null, shown: string | null): number | undefined {
  return value === null || value === shown ? undefined : value.length;
}

function toolOutputCount(parts: readonly ChatTimelinePart[]): number {
  return parts.reduce(
    (count, part) => (part.kind === 'tool' ? count + Number(part.tool.output !== null) : count),
    0,
  );
}

export function boundedTimeline(
  embed: ChatTimelineEmbed,
  fieldChars: number = TIMELINE_FIELD_CHARS,
  budgetChars: number = TIMELINE_BUDGET_CHARS,
): ChatTimelineEmbed {
  const limit = Math.min(
    fieldChars,
    Math.floor(budgetChars / Math.max(toolOutputCount(embed.parts), 1)),
  );
  const parts = embed.parts.map((part): ChatTimelinePart => {
    if (part.kind !== 'tool') return part;
    const full = part.tool.output;
    if (full === null) return part;
    const output = clipped(full, limit);
    if (output === full) return part;
    return { ...part, tool: { ...part.tool, output, output_chars: full.length } };
  });
  return parts.some((part, index) => part !== embed.parts[index]) ? { ...embed, parts } : embed;
}

export const COMPACT_FIELD_CHARS = 1_000;
export const COMPACT_TEXT_CHARS = 300;
export const COMPACT_LINK_CHARS = 2_000;

const FILE_EVIDENCE_KEYS = ['meta', 'changes', 'native_result', 'structuredPatch'] as const;

function clippedLeaf(value: string): string {
  const limit = value.includes('://') ? COMPACT_LINK_CHARS : COMPACT_TEXT_CHARS;
  return clipped(value, limit);
}

function clippedLeaves(value: unknown): unknown {
  if (typeof value === 'string') return clippedLeaf(value);
  if (isUnknownArray(value)) return value.map(clippedLeaves);
  if (value === null || typeof value !== 'object') return value;
  const entries: readonly (readonly [string, unknown])[] = Object.entries(value);
  return Object.fromEntries(entries.map(([key, leaf]) => [key, clippedLeaves(leaf)]));
}

function parsedRecord(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function carriesFileEvidence(record: unknown): boolean {
  return (
    record !== null &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    FILE_EVIDENCE_KEYS.some((key) => key in record)
  );
}

function compactField(
  value: string | null,
  field: (typeof AI_TOOL_RESULT_FIELDS)[number],
): string | null {
  if (value === null || value.length <= COMPACT_FIELD_CHARS) return value;
  const record = parsedRecord(value);
  if (record === undefined) return field === 'input' ? value : clipped(value, COMPACT_FIELD_CHARS);
  if (field === 'output' && carriesFileEvidence(record)) return value;
  const text = JSON.stringify(clippedLeaves(record));
  return text.length < value.length ? text : value;
}

function isBackgroundShell(record: unknown): boolean {
  return (
    record !== null &&
    typeof record === 'object' &&
    'run_in_background' in record &&
    record.run_in_background === true
  );
}

function keepsInputWhole(tool: ChatTimelineTool): boolean {
  if (tool.name === TODO_TOOL_NAME || tool.name === PLAN_TOOL_NAME) return true;
  if (!SHELL_TOOL_NAMES.has(tool.name) || tool.input === null) return false;
  return isBackgroundShell(parsedRecord(tool.input));
}

function compactTool(tool: ChatTimelineTool): ChatTimelineTool {
  if (tool.state === 'running') return tool;
  const input = keepsInputWhole(tool) ? tool.input : compactField(tool.input, 'input');
  const output = compactField(tool.output, 'output');
  if (input === tool.input && output === tool.output) return tool;
  const input_chars = fullLength(tool.input, input);
  const output_chars = fullLength(tool.output, output);
  return {
    ...tool,
    input,
    output,
    ...(input_chars === undefined ? {} : { input_chars }),
    ...(output_chars === undefined ? {} : { output_chars }),
  };
}

export function compactTimeline(embed: ChatTimelineEmbed): ChatTimelineEmbed {
  const parts = embed.parts.map((part): ChatTimelinePart => {
    if (part.kind !== 'tool') return part;
    const tool = compactTool(part.tool);
    return tool === part.tool ? part : { ...part, tool };
  });
  return parts.some((part, index) => part !== embed.parts[index]) ? { ...embed, parts } : embed;
}
