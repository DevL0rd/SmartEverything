import { z } from 'zod';
import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '@smarteverything/domain';
const FILE = z.object({
  attachmentId: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .transform(AttachmentId),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\\0]+$/),
  bytes: z.int().nonnegative(),
});
const IMAGE = FILE.omit({ name: true }).extend({
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  width: z.int().positive(),
  height: z.int().positive(),
  name: FILE.shape.name.optional(),
  originalDimensions: z
    .object({ width: z.int().positive(), height: z.int().positive() })
    .optional(),
});
const REF = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), attachment: FILE }),
  z.object({ type: z.literal('image'), attachment: IMAGE }),
]);
export async function verifyNativeAttachments(
  ctx: Context,
  refs: readonly JsonValue[],
): Promise<void> {
  for (const value of refs) {
    const ref = REF.parse(value);
    if (ref.type === 'image') await ctx.attachments.readImage(imageReference(ref.attachment));
    else for await (const chunk of ctx.attachments.readFileStream(ref.attachment)) void chunk;
  }
}

function imageReference(input: z.infer<typeof IMAGE>): ImageAttachmentRef {
  const { name, originalDimensions, ...required } = input;
  return {
    ...required,
    ...(name === undefined ? {} : { name }),
    ...(originalDimensions === undefined ? {} : { originalDimensions }),
  };
}
