import { z } from 'zod';
import type { AttachmentAdmissionPart } from '@deepseek-ai/dsh-attachment';
import type { HarnessRuntime } from '../host/runtime';
import { createHash } from 'node:crypto';
import { HARNESS_ATTACHMENT_TRANSFER } from '@smarteverything/domain';
export interface HarnessAttachment {
  readonly id?: string;
  readonly name: string;
  readonly mime: string;
  readonly data: Uint8Array;
  readonly transcript: string | null;
}
import type { HarnessControlPersistence } from './contracts';
import type { HarnessHttp } from './http';
import { HarnessRuntimeError } from '../host/errors';

export async function* transferAttachments(
  http: HarnessHttp,
  persistence: HarnessControlPersistence,
  id: string,
  ids: readonly string[],
): AsyncIterable<HarnessAttachment> {
  for (const attachmentId of ids) {
    const file = await http.call(
      { operation: 'attachment', claim: persistence.claim(id), attachment_id: attachmentId },
      HARNESS_ATTACHMENT_TRANSFER,
    );
    const data = Buffer.from(file.data, 'base64');
    if (
      data.byteLength !== file.bytes ||
      data.toString('base64') !== file.data ||
      createHash('sha256').update(data).digest('hex') !== file.sha256
    )
      throw new HarnessRuntimeError(
        'operation_failed',
        'Transferred attachment does not match its admitted original bytes.',
      );
    yield { id: attachmentId, name: file.name, mime: file.mime, data, transcript: file.transcript };
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
    if (file.data.byteLength > TEXT_ATTACHMENT_BYTES_MAX)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'This text attachment exceeds the admitted inline provider bound; its original bytes remain stored.',
      );
    content.push({
      type: 'text',
      text: `[Attached file: ${file.name}]\n${new TextDecoder('utf-8', { fatal: true }).decode(file.data)}`,
    });
  } else if (file.transcript !== null)
    content.push({ type: 'text', text: `[Transcript of ${file.name}]\n${file.transcript}` });
  return content;
}

export function cachedMediaText(file: HarnessAttachment): string {
  if (file.transcript === null || file.transcript.trim() === '')
    throw new HarnessRuntimeError(
      'capability_unsupported',
      `Cached media text for ${file.name} is missing; older originals will not be resent automatically.`,
    );
  const reference =
    file.id === undefined
      ? ''
      : ` Original attachment: ${file.id}; use read_assistant_attachment for explicit inspection.`;
  return `[Attached ${file.name} (${file.mime}).${reference}]\n${file.transcript}`;
}
