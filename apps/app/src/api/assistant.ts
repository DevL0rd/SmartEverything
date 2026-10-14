import {
  API_ENDPOINTS as E,
  type AssistantAttachment,
  type AssistantMessageRow,
  type AssistantSettingsChange,
  type AssistantStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { SignedLink } from './media';
import { api } from './transport';
import {
  assertAssistantWriteCurrent,
  responseStyleSupported,
  type AssistantWriteScope,
} from '../store/assistant-response-style';

const log = new Logger('app.assistant');

export async function sendAssistantMessage(
  text: string,
  attachments: readonly string[],
): Promise<AssistantMessageRow> {
  const row = await api().call(E.sendAssistantMessage, {
    body: { text, attachments: [...attachments] },
  });
  log.info('assistant.sent', { messageId: row.id, attachments: attachments.length });
  return row;
}

export async function removeAssistantMessage(messageId: string): Promise<void> {
  await api().call(E.removeAssistantMessage, { params: { messageId } });
  log.info('assistant.message_removed', { messageId });
}

export async function clearAssistantMessages(): Promise<void> {
  await api().call(E.clearAssistantMessages, {});
  log.info('assistant.cleared', {});
}

export interface UploadStart {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
}

export async function startAssistantUpload(
  file: UploadStart,
): Promise<{ readonly uploadId: string; readonly chunkBytes: number }> {
  const upload = await api().call(E.startAssistantUpload, { body: { ...file } });
  return { uploadId: upload.uploadId, chunkBytes: upload.chunkBytes };
}

export async function sendAssistantUploadChunk(
  uploadId: string,
  index: number,
  data: string,
): Promise<void> {
  await api().call(E.sendAssistantUploadChunk, { params: { uploadId }, body: { index, data } });
}

export async function finishAssistantUpload(uploadId: string): Promise<AssistantAttachment> {
  const attachment = await api().call(E.finishAssistantUpload, { params: { uploadId } });
  log.info('assistant.uploaded', { attachmentId: attachment.id, bytes: attachment.bytes });
  return attachment;
}

export async function assistantAttachmentLinks(
  ids: readonly string[],
): Promise<Readonly<Record<string, SignedLink>>> {
  const client = api().forMedia();
  const links = await client.call(E.assistantAttachmentLinks, { body: { ids: [...ids] } });
  return Object.fromEntries(
    await Promise.all(
      links.map(
        async (link) =>
          [
            link.id,
            {
              url: await client.resourceUrl(link.url, link.expiresAt, 'attachment'),
              expiresAt: link.expiresAt,
            },
          ] as const,
      ),
    ),
  );
}

export async function updateAssistantSettings(
  change: AssistantSettingsChange,
  scope?: AssistantWriteScope,
): Promise<AssistantStatus> {
  const client = scope?.client ?? api();
  const enrich = change.response_style !== undefined || responseStyleSupported();
  const status = await client.call(E.updateAssistantSettings, { body: change });
  if (scope !== undefined) assertAssistantWriteCurrent(scope);
  log.info('assistant.settings_updated', { fields: Object.keys(change) });
  if (!enrich) return status;
  const style = await client.call(E.readAssistantResponseStyle, {});
  if (scope !== undefined) assertAssistantWriteCurrent(scope);
  return { ...status, settings: { ...status.settings, response_style: style } };
}
