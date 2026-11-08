import type { NativeMediaNote } from '@smarteverything/harness/process';
import { nativeMediaNote } from '../harness/native-media-notes';
import type { ServerContext } from './context';
import type { LocalHarnessPersistence } from '../harness/local-persistence';

export function hubImageDescription(
  context: ServerContext,
  persistence: LocalHarnessPersistence,
): NativeMediaNote {
  return async (input): Promise<string> => {
    const claim = persistence.claim(input.sessionId);
    await persistence.verify(claim);
    const text = await nativeMediaNote(context.harness, context.assistant.files, claim, {
      seq: input.seq,
      image_index: input.imageIndex,
      attachment_id: input.image.attachment.attachmentId,
      data: Buffer.from(input.data).toString('base64'),
    });
    await persistence.verify(claim);
    return text;
  };
}
