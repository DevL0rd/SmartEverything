import type { ChatTimelinePart, ChatTimelineTool } from '@smarteverything/domain';
import { finalView } from './stream-view';

export const TEXT_CHUNK_CHARS = 1400;

export type InlineToolActivity = Exclude<ChatTimelinePart, { readonly kind: 'text' }>;
export type InlineTimelinePart =
  | Exclude<ChatTimelinePart, { readonly kind: 'tool' }>
  | {
      readonly kind: 'tools';
      readonly key: string;
      readonly tools: readonly ChatTimelineTool[];
      readonly activities: readonly InlineToolActivity[];
    }
  | { readonly kind: 'image'; readonly key: string; readonly operationId: string };

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

function appendTool(
  result: InlineTimelinePart[],
  part: Extract<ChatTimelinePart, { readonly kind: 'tool' }>,
): void {
  const previous = result.at(-1);
  if (previous?.kind === 'tools') {
    result.splice(result.length - 1, 1, {
      ...previous,
      tools: [...previous.tools, part.tool],
      activities: [...previous.activities, part],
    });
  } else {
    result.push({ kind: 'tools', key: part.key, tools: [part.tool], activities: [part] });
  }
  if (part.tool.image_operation_id !== null) {
    result.push({
      kind: 'image',
      key: `image:${part.key}`,
      operationId: part.tool.image_operation_id,
    });
  }
}

export function streamingKey(parts: readonly InlineTimelinePart[], live: boolean): string | null {
  return live ? (parts.at(-1)?.key ?? null) : null;
}
