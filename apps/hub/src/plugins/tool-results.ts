import { z } from 'zod';
import type { HubToolResult, ToolPicture } from '../ai-tools/hub-tool';

const TEXT_BLOCK = z.looseObject({ type: z.literal('text'), text: z.string() });

const IMAGE_BLOCK = z.looseObject({
  type: z.literal('image'),
  data: z.base64(),
  mimeType: z.string().min(1),
});

const RESULT = z.looseObject({
  content: z.array(z.unknown()).default([]),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  isError: z.boolean().default(false),
});

function textsOf(content: readonly unknown[]): string {
  return content
    .flatMap((block) => {
      const text = TEXT_BLOCK.safeParse(block);
      return text.success ? [text.data.text] : [];
    })
    .join('\n');
}

function picturesOf(content: readonly unknown[]): ToolPicture[] {
  return content.flatMap((block) => {
    const image = IMAGE_BLOCK.safeParse(block);
    return image.success
      ? [{ data: Buffer.from(image.data.data, 'base64'), mimeType: image.data.mimeType }]
      : [];
  });
}

export function hubResultOf(raw: unknown): HubToolResult {
  const parsed = RESULT.safeParse(raw);
  if (!parsed.success) {
    return {
      response: { error: 'The plugin answered in a shape SmartEverything does not understand' },
      line: '',
      pictures: [],
    };
  }
  const text = textsOf(parsed.data.content);
  const pictures = picturesOf(parsed.data.content);
  if (parsed.data.isError) {
    const error = text === '' ? 'The plugin reported a failure' : text;
    return { response: { error }, line: '', pictures };
  }
  return { response: parsed.data.structuredContent ?? { text }, line: '', pictures };
}
