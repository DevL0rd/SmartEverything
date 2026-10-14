import { z } from 'zod';
import { CHAT_TOOL_ITEM } from './ai-chats';

export const CHAT_TIMELINE_TOOL = CHAT_TOOL_ITEM.extend({
  state: z.enum(['running', 'done', 'failed', 'interrupted', 'unknown']),
  input: z.string().nullable().default(null),
  output: z.string().nullable().default(null),
  redacted: z.boolean().default(false),
  image_operation_id: z.uuid().nullable().default(null),
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

export function timelineChunks(
  parts: readonly ChatTimelinePart[],
  maximum: number,
): readonly (readonly ChatTimelinePart[])[] {
  const chunks: ChatTimelinePart[][] = [[]];
  let length = 0;
  for (const part of parts) {
    if (part.kind !== 'text') {
      chunks.at(-1)?.push(part);
      continue;
    }
    let remaining = part.text;
    while (remaining !== '') {
      if (length === maximum) {
        chunks.push([]);
        length = 0;
      }
      const text = remaining.slice(0, maximum - length);
      chunks.at(-1)?.push({ ...part, key: `${part.key}:${String(chunks.length - 1)}`, text });
      length += text.length;
      remaining = remaining.slice(text.length);
    }
  }
  return chunks;
}
