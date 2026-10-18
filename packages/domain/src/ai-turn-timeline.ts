import { z } from 'zod';
import { CHAT_TOOL_ITEM } from './ai-chats';

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
]);
export type ChatTimelinePart = z.infer<typeof CHAT_TIMELINE_PART>;
export const CHAT_TIMELINE_EMBED = z.object({
  kind: z.literal('chat_timeline'),
  version: z.literal(1),
  parts: z.array(CHAT_TIMELINE_PART),
});
export type ChatTimelineEmbed = z.infer<typeof CHAT_TIMELINE_EMBED>;

export const TIMELINE_FIELD_CHARS = 64_000;
export const TIMELINE_BUDGET_CHARS = 512_000;

export const TOOL_RESULT_PAGE_CHARS = 64_000;

export const AI_TOOL_RESULT_FIELDS = ['output', 'input'] as const;
export const AI_TOOL_RESULT_PAGE = z.strictObject({
  call_id: z.string(),
  name: z.string(),
  field: z.enum(AI_TOOL_RESULT_FIELDS),
  offset: z.int().nonnegative(),
  total_chars: z.int().nonnegative(),
  text: z.string(),
  next_offset: z.int().nonnegative().nullable(),
});
export type AiToolResultPage = z.infer<typeof AI_TOOL_RESULT_PAGE>;

function clipped(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const splitsPair = /[\uD800-\uDBFF]/.test(value.charAt(limit - 1));
  return value.slice(0, splitsPair ? (limit > 1 ? limit - 1 : 2) : limit);
}

function clippedField(value: string | null, limit: number): string | null {
  return value === null ? null : clipped(value, limit);
}

export function toolResultPage(
  tool: ChatTimelineTool,
  field: (typeof AI_TOOL_RESULT_FIELDS)[number],
  offset: number,
  limit: number,
): AiToolResultPage {
  const full = tool[field] ?? '';
  const start = Math.min(offset, full.length);
  const text = clipped(full.slice(start), limit);
  const end = start + text.length;
  return {
    call_id: tool.callId,
    name: tool.name,
    field,
    offset: start,
    total_chars: full.length,
    text,
    next_offset: end < full.length ? end : null,
  };
}

function fullLength(value: string | null, shown: string | null): number | undefined {
  return value === null || value === shown ? undefined : value.length;
}

function toolFieldCount(parts: readonly ChatTimelinePart[]): number {
  return parts.reduce(
    (count, part) =>
      part.kind === 'tool'
        ? count + Number(part.tool.input !== null) + Number(part.tool.output !== null)
        : count,
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
    Math.floor(budgetChars / Math.max(toolFieldCount(embed.parts), 1)),
  );
  const parts = embed.parts.map((part): ChatTimelinePart => {
    if (part.kind !== 'tool') return part;
    const input = clippedField(part.tool.input, limit);
    const output = clippedField(part.tool.output, limit);
    if (input === part.tool.input && output === part.tool.output) return part;
    const input_chars = fullLength(part.tool.input, input);
    const output_chars = fullLength(part.tool.output, output);
    return {
      ...part,
      tool: {
        ...part.tool,
        input,
        output,
        ...(input_chars === undefined ? {} : { input_chars }),
        ...(output_chars === undefined ? {} : { output_chars }),
      },
    };
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
  if (Array.isArray(value)) return value.map(clippedLeaves);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, leaf]) => [key, clippedLeaves(leaf)]));
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
  if (record === undefined || (field === 'output' && carriesFileEvidence(record))) return value;
  const text = JSON.stringify(clippedLeaves(record));
  return text.length < value.length ? text : value;
}

function compactTool(tool: ChatTimelineTool): ChatTimelineTool {
  if (tool.state === 'running') return tool;
  const input = compactField(tool.input, 'input');
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
