import type { ChatTimelinePart, ChatTimelineTool } from '@smarteverything/domain';

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
    if (part.kind !== 'tool') {
      result.push(part);
      continue;
    }
    appendTool(result, part);
  }
  return result;
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
