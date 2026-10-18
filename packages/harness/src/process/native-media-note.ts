import { HARNESS_NATIVE_MEDIA_NOTE } from '@smarteverything/domain';
import type { Context } from '@deepseek-ai/cordis';
import type { ImageBlock } from '@deepseek-ai/dsh-llm';
import type { SessionSeq } from '@deepseek-ai/dsh-session';
import type { HarnessHub } from './http';
import type { HarnessControlPersistence } from './contracts';

export interface NativeMediaNoteInput {
  readonly sessionId: string;
  readonly seq: SessionSeq;
  readonly imageIndex: number;
  readonly image: ImageBlock;
  readonly data: Uint8Array;
  readonly signal: AbortSignal;
}
export type NativeMediaNote = (input: NativeMediaNoteInput) => Promise<string>;

export async function nativeImageNote(
  ctx: Context,
  input: Omit<NativeMediaNoteInput, 'data'>,
  describe: NativeMediaNote,
): Promise<string> {
  const image = await ctx.attachments.readImage(input.image.attachment, input.signal);
  return describe({ ...input, data: image.data });
}

export async function transferNativeImageNote(
  http: HarnessHub,
  persistence: HarnessControlPersistence,
  input: NativeMediaNoteInput,
): Promise<string> {
  const note = await http.call(
    {
      operation: 'native_media_note',
      claim: persistence.claim(input.sessionId),
      input: {
        seq: input.seq,
        image_index: input.imageIndex,
        attachment_id: input.image.attachment.attachmentId,
        data: Buffer.from(input.data).toString('base64'),
      },
    },
    HARNESS_NATIVE_MEDIA_NOTE,
    input.signal,
  );
  return note.text;
}
