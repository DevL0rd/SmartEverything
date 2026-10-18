import type { InboundMessage } from '@smarteverything/domain';
import { mimeOf, safeFileName, type Downloader } from './media-download';
import type { RawAttachment } from './payloads';
import { messageOf } from '@smarteverything/logging';

type InboundAttachment = InboundMessage['attachments'][number];

export interface AttachedFiles {
  readonly attachments: InboundAttachment[];
  readonly notes: string[];
}

export interface AttachmentLimits {
  readonly enabled: boolean;
  readonly maxFileBytes: number;
}

async function one(
  attachment: RawAttachment,
  maxFileBytes: number,
  download: Downloader,
): Promise<InboundAttachment> {
  const { data, type } = await download(attachment.url, maxFileBytes);
  return {
    name: safeFileName(attachment.filename),
    mime: await mimeOf(data, attachment.content_type ?? type),
    source: { kind: 'base64', data: data.toString('base64') },
  };
}

export async function attachedFiles(
  attachments: readonly RawAttachment[],
  limits: AttachmentLimits,
  download: Downloader,
): Promise<AttachedFiles> {
  if (attachments.length === 0) {
    return { attachments: [], notes: [] };
  }
  if (!limits.enabled) {
    return {
      attachments: [],
      notes: [
        `${String(attachments.length)} attachment(s) were not read: attachments are switched off.`,
      ],
    };
  }
  const kept: InboundAttachment[] = [];
  const notes: string[] = [];
  for (const attachment of attachments) {
    try {
      kept.push(await one(attachment, limits.maxFileBytes, download));
    } catch (cause) {
      notes.push(`Attachment "${attachment.filename}" was not attached: ${messageOf(cause)}`);
    }
  }
  return { attachments: kept, notes };
}
