import { z } from 'zod';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';

const IMAGE_RESULT = z.object({
  result: z.object({ id: z.uuid(), mime: z.string().regex(/^image\//) }),
});
const ORIGINAL_REFERENCE = z.object({ original_attachment_id: z.uuid() });

export function originalMediaId(block: ContentBlock): string | undefined {
  const parsed = ORIGINAL_REFERENCE.safeParse(block);
  return parsed.success ? parsed.data.original_attachment_id : undefined;
}

export function toolMediaReferences(
  blocks: readonly ContentBlock[],
  result: unknown,
): ContentBlock[] {
  const parsed = IMAGE_RESULT.safeParse(result);
  if (!parsed.success) return [...blocks];
  return blocks.map((block) =>
    block.type === 'image' ? { ...block, original_attachment_id: parsed.data.result.id } : block,
  );
}
