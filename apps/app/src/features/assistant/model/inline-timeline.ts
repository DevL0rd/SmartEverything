import {
  AI_CODE_EXECUTION_TOOL_NAMES,
  type ChatTimelinePart,
  type ChatTimelineTool,
} from '@smarteverything/domain';
import { finalView } from './stream-view';

export const TEXT_CHUNK_CHARS = 1400;

export type InlineToolActivity = Exclude<ChatTimelinePart, { readonly kind: 'text' | 'steer' }>;
export type InlineTimelinePart =
  | Exclude<ChatTimelinePart, { readonly kind: 'tool' }>
  | {
      readonly kind: 'tools';
      readonly key: string;
      readonly tools: readonly ChatTimelineTool[];
      readonly activities: readonly InlineToolActivity[];
    }
  | {
      readonly kind: 'image';
      readonly key: string;
      readonly operationId: string;
      readonly awaitingReceipt: boolean;
    };

export function inlineTimeline(parts: readonly ChatTimelinePart[]): readonly InlineTimelinePart[] {
  const result: InlineTimelinePart[] = [];
  for (const part of parts) {
    if (part.kind === 'text' && part.text.trim() === '') continue;
    const previous = result.at(-1);
    if (part.kind === 'reasoning' && previous?.kind === 'tools') {
      result[result.length - 1] = { ...previous, activities: [...previous.activities, part] };
      continue;
    }
    if (part.kind === 'text') {
      result.push(...textChunks(part));
      continue;
    }
    if (part.kind !== 'tool') {
      result.push(part);
      continue;
    }
    appendTool(result, part);
  }
  return result;
}

type TextPart = Extract<ChatTimelinePart, { readonly kind: 'text' }>;

function textChunks(part: TextPart): readonly TextPart[] {
  if (part.text.length <= TEXT_CHUNK_CHARS) return [part];
  const view = finalView(part.text);
  const blocks = view.tail === '' ? view.settled : [...view.settled, view.tail];
  const chunks: string[][] = [[]];
  let size = 0;
  for (const block of blocks) {
    const current = chunks[chunks.length - 1] ?? [];
    if (size > 0 && size + block.length > TEXT_CHUNK_CHARS) {
      chunks.push([block]);
      size = block.length;
    } else {
      current.push(block);
      size += block.length;
    }
  }
  if (chunks.length === 1) return [part];
  return chunks.map((blocksOfChunk, index) => ({
    kind: 'text',
    key: index === 0 ? part.key : `${part.key}#${String(index)}`,
    text: blocksOfChunk.join('\n\n'),
  }));
}

const LOOP_TOOLS: ReadonlySet<string> = new Set(AI_CODE_EXECUTION_TOOL_NAMES);

export function isLoopTool(tool: ChatTimelineTool): boolean {
  return LOOP_TOOLS.has(tool.name);
}

type ToolGroup = Extract<InlineTimelinePart, { readonly kind: 'tools' }>;

function mergeable(
  group: ToolGroup,
  part: Extract<ChatTimelinePart, { readonly kind: 'tool' }>,
): boolean {
  return group.tools.every((tool) => !isLoopTool(tool)) && !isLoopTool(part.tool);
}

function appendTool(
  result: InlineTimelinePart[],
  part: Extract<ChatTimelinePart, { readonly kind: 'tool' }>,
): void {
  const previous = result.at(-1);
  if (previous?.kind === 'tools' && mergeable(previous, part)) {
    const tools = [...previous.tools, part.tool];
    const activities = [...previous.activities, part];
    result.splice(result.length - 1, 1, { ...previous, tools, activities });
  } else {
    const thoughts = leadingThoughts(result);
    const activities = [...thoughts, part];
    const key = thoughts[0]?.key ?? part.key;
    result.push({ kind: 'tools', key, tools: [part.tool], activities });
  }
  if (part.tool.image_operation_id !== null) {
    result.push({
      kind: 'image',
      key: `image:${part.key}`,
      operationId: part.tool.image_operation_id,
      awaitingReceipt: part.tool.state === 'running' || part.tool.state === 'done',
    });
  }
}

type ReasoningPart = Extract<ChatTimelinePart, { readonly kind: 'reasoning' }>;

function leadingThoughts(result: InlineTimelinePart[]): readonly ReasoningPart[] {
  let start = result.length;
  while (start > 0 && result[start - 1]?.kind === 'reasoning') start -= 1;
  return result.splice(start).flatMap((entry) => (entry.kind === 'reasoning' ? [entry] : []));
}

export function streamingKey(parts: readonly InlineTimelinePart[], live: boolean): string | null {
  return live ? (parts.at(-1)?.key ?? null) : null;
}
