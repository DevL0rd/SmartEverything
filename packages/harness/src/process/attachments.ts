import { z } from 'zod';
import type { AttachmentAdmissionPart } from '@deepseek-ai/dsh-attachment';
import type { HarnessRuntime } from '../host/runtime';
import { attachmentNote, HARNESS_ATTACHMENT_TRANSFER } from '@smarteverything/domain';
import type { HarnessControlPersistence } from './contracts';
import type { HarnessHub } from './http';
export interface HarnessAttachment {
  readonly id?: string;
  readonly name: string;
  readonly mime: string;
  readonly data: Uint8Array;
  readonly transcript: string | null;
}

export async function* transferAttachments(
  hub: HarnessHub,
  persistence: Pick<HarnessControlPersistence, 'claim'>,
  id: string,
  ids: readonly string[],
): AsyncIterable<HarnessAttachment> {
  for (const attachmentId of ids) {
    const [file, bytes] = await Promise.all([
      hub.call(
        { operation: 'attachment', claim: persistence.claim(id), attachment_id: attachmentId },
        HARNESS_ATTACHMENT_TRANSFER,
      ),
      hub.download(`/api/ai/harness/sessions/${id}/attachments/${attachmentId}`),
    ]);
    yield {
      id: attachmentId,
      name: file.name,
      mime: file.mime,
      data: bytes,
      transcript: file.transcript,
    };
  }
}

const TEXT_ATTACHMENT_BYTES_MAX = 150_000;
const IMAGE_MEDIA_TYPE = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export async function nativeAttachmentParts(
  runtime: HarnessRuntime,
  file: HarnessAttachment,
  mode: 'current' | 'history' | 'text' = 'current',
): Promise<readonly AttachmentAdmissionPart[]> {
  if (
    /^(image|audio|video)\//.test(file.mime) &&
    (mode !== 'current' || !IMAGE_MEDIA_TYPE.safeParse(file.mime).success)
  )
    return [{ type: 'text', text: cachedMediaText(file) }];
  if (file.mime.startsWith('image/'))
    return [
      {
        type: 'image',
        mediaType: IMAGE_MEDIA_TYPE.parse(file.mime),
        name: file.name,
        data: Buffer.from(file.data).toString('base64'),
      },
    ];
  const attachment = await runtime.admitFile({
    name: file.name,
    data: Buffer.from(file.data).toString('base64'),
  });
  const content: AttachmentAdmissionPart[] = [{ type: 'file', attachment }];
  if (file.mime.startsWith('text/') || file.mime === 'application/json') {
    content.push({
      type: 'text',
      text:
        file.data.byteLength > TEXT_ATTACHMENT_BYTES_MAX
          ? largeFileNote(file, runtime.attachmentPath(attachment))
          : `[Attached file: ${file.name}]\n${new TextDecoder('utf-8', { fatal: true }).decode(file.data)}`,
    });
  } else if (file.transcript !== null)
    content.push({ type: 'text', text: `[Transcript of ${file.name}]\n${file.transcript}` });
  return content;
}

function largeFileNote(file: HarnessAttachment, path: string | undefined): string {
  const where = path ?? 'its attachment store';
  return `[Attached file: ${file.name}, ${String(file.data.byteLength)} bytes, too large to include inline. Read it from ${where}.]`;
}

export function cachedMediaText(file: HarnessAttachment): string {
  const note = file.transcript?.trim() ?? '';
  return attachmentNote(
    {
      id: file.id ?? file.name,
      name: file.name,
      mime: file.mime,
      bytes: file.data.byteLength,
      width: null,
      height: null,
    },
    note === '' ? null : note,
    { pending: note === '' },
  );
}
