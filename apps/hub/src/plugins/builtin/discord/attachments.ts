import type { InboundMessage } from '@smarteverything/domain';
import { DiscordInputError } from './errors';
import { attachmentUrl, type Downloader } from './media-download';
import { inspectFile } from './media-formats';
import type { RawAttachment } from './payloads';

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
  channelId: string,
  limits: AttachmentLimits,
  download: Downloader,
): Promise<InboundAttachment> {
  if (attachment.size > limits.maxFileBytes) {
    throw new DiscordInputError('it is larger than the file size limit in the plugin settings');
  }
  const url = attachmentUrl(attachment.url, channelId, attachment.id);
  const bytes = await download(url, attachment.size);
  const mime = await inspectFile(bytes, attachment.filename, attachment.content_type ?? undefined);
  return {
    name: attachment.filename,
    mime,
    source: { kind: 'base64', data: bytes.toString('base64') },
  };
}

export async function attachedFiles(
  attachments: readonly RawAttachment[],
  channelId: string,
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
      kept.push(await one(attachment, channelId, limits, download));
    } catch (cause) {
      notes.push(
        `Attachment "${attachment.filename}" was not attached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  return { attachments: kept, notes };
}
