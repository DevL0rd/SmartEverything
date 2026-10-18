import { CLAUDE_TEXT_LIMIT, type ClaudeThreadItem } from '@smarteverything/domain';
import { z } from 'zod';
import { isoOf } from './tolerant';
import type { RawLine } from './transcript-file';
import { messageOf } from '@smarteverything/logging';

const CONVERSATION_TYPES: ReadonlySet<string> = new Set(['user', 'assistant', 'system']);

const TYPE_IN_HEAD = /^\{(?:"[A-Za-z]+":(?:"[^"]*"|[^,{}[\]"]*),)*?"type":"([^"]*)"/;

const TEXT_PART = z.object({ type: z.string(), text: z.string().optional() });

const BLOCK = z.object({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  content: z.union([z.string(), z.array(TEXT_PART)]).optional(),
  is_error: z.boolean().optional(),
});

type Block = z.output<typeof BLOCK>;

const USAGE = z.object({
  input_tokens: z.int().min(0).optional(),
  cache_creation_input_tokens: z.int().min(0).optional(),
  cache_read_input_tokens: z.int().min(0).optional(),
});

const LINE = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  subtype: z.string().optional(),
  content: z.string().optional(),
  message: z
    .object({
      content: z.union([z.string(), z.array(BLOCK)]).optional(),
      usage: USAGE.optional(),
    })
    .optional(),
});

type Line = z.output<typeof LINE>;

export type LineResult =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | {
      readonly kind: 'parsed';
      readonly items: readonly ClaudeThreadItem[];
      readonly context: number | null;
    };

interface Clipped {
  readonly text: string;
  readonly truncated: boolean;
}

function clip(text: string): Clipped {
  return text.length > CLAUDE_TEXT_LIMIT
    ? { text: text.slice(0, CLAUDE_TEXT_LIMIT), truncated: true }
    : { text, truncated: false };
}

function resultText(content: Block['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return (content ?? []).map((part) => part.text ?? `[${part.type}]`).join('\n');
}

interface Base {
  readonly id: string;
  readonly at: string | null;
  readonly sidechain: boolean;
  readonly meta: boolean;
}

function baseOf(line: Line, offset: number, index: number): Base {
  const moment = line.timestamp === undefined ? Number.NaN : Date.parse(line.timestamp);
  return {
    id: `${String(offset)}.${String(index)}`,
    at: Number.isNaN(moment) ? null : isoOf(moment),
    sidechain: line.isSidechain === true,
    meta: line.isMeta === true,
  };
}

type Role = 'user' | 'assistant';

type ItemBuilder = (block: Block, role: Role, base: Base) => ClaudeThreadItem;

const textItem: ItemBuilder = (block, role, base) => {
  const { text, truncated } = clip(block.text ?? '');
  return { ...base, kind: role, text, truncated };
};

const thinkingItem: ItemBuilder = (block, _role, base) => {
  const { text, truncated } = clip(block.thinking ?? '');
  return { ...base, kind: 'thinking', text, truncated };
};

const toolUseItem: ItemBuilder = (block, _role, base) => {
  const { text, truncated } = clip(JSON.stringify(block.input ?? null));
  return {
    ...base,
    kind: 'tool_use',
    tool_use_id: block.id ?? '',
    tool_name: block.name ?? '',
    input: text,
    truncated,
  };
};

const toolResultItem: ItemBuilder = (block, _role, base) => {
  const { text, truncated } = clip(resultText(block.content));
  return {
    ...base,
    kind: 'tool_result',
    tool_use_id: block.tool_use_id ?? '',
    text,
    is_error: block.is_error === true,
    truncated,
  };
};

const otherItem: ItemBuilder = (block, _role, base) => ({
  ...base,
  kind: 'other',
  block: block.type.slice(0, 100),
  truncated: false,
});

const BUILDERS: Readonly<Record<string, ItemBuilder>> = {
  text: textItem,
  thinking: thinkingItem,
  tool_use: toolUseItem,
  tool_result: toolResultItem,
};

function blockItem(block: Block, role: Role, base: Base): ClaudeThreadItem {
  return (BUILDERS[block.type] ?? otherItem)(block, role, base);
}

function messageItems(line: Line, offset: number, role: Role): ClaudeThreadItem[] {
  const content = line.message?.content;
  if (content === undefined) {
    return [];
  }
  if (typeof content === 'string') {
    const { text, truncated } = clip(content);
    return [{ ...baseOf(line, offset, 0), kind: role, text, truncated }];
  }
  return content.map((block, index) => blockItem(block, role, baseOf(line, offset, index)));
}

function systemItems(line: Line, offset: number): ClaudeThreadItem[] {
  const { text, truncated } = clip(line.content ?? '');
  return [
    {
      ...baseOf(line, offset, 0),
      kind: 'system',
      subtype: line.subtype ?? null,
      text,
      truncated,
    },
  ];
}

function contextOf(line: Line): number | null {
  const usage = line.message?.usage;
  if (line.type !== 'assistant' || line.isSidechain === true || usage === undefined) {
    return null;
  }
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

function itemsOf(line: Line, offset: number): ClaudeThreadItem[] {
  switch (line.type) {
    case 'user':
      return messageItems(line, offset, 'user');
    case 'assistant':
      return messageItems(line, offset, 'assistant');
    default:
      return systemItems(line, offset);
  }
}

function jsonOf(raw: RawLine): { readonly json: unknown } | LineResult {
  if (raw.text === null) {
    return { kind: 'skipped', reason: 'the line is larger than 16 MB' };
  }
  try {
    return { json: JSON.parse(raw.text) };
  } catch (cause) {
    return { kind: 'skipped', reason: messageOf(cause) };
  }
}

export function parseLine(raw: RawLine): LineResult {
  const type = TYPE_IN_HEAD.exec(raw.head)?.[1];
  if (type !== undefined && !CONVERSATION_TYPES.has(type)) {
    return { kind: 'ignored' };
  }
  const read = jsonOf(raw);
  if ('kind' in read) {
    return read;
  }
  const parsed = LINE.safeParse(read.json);
  if (!parsed.success) {
    return { kind: 'skipped', reason: parsed.error.issues[0]?.message ?? 'unexpected shape' };
  }
  if (!CONVERSATION_TYPES.has(parsed.data.type)) {
    return { kind: 'ignored' };
  }
  return {
    kind: 'parsed',
    items: itemsOf(parsed.data, raw.offset),
    context: contextOf(parsed.data),
  };
}
