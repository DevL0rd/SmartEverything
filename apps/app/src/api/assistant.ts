import {
  API_ENDPOINTS as E,
  type AssistantAttachment,
  type AssistantMessageRow,
  type AssistantSettingsChange,
  type AssistantStatus,
  type ResponderApp,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { SignedLink } from './media';
import { api } from './transport';

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
  const links = await api().call(E.assistantAttachmentLinks, { body: { ids: [...ids] } });
  return Object.fromEntries(
    links.map((link) => [link.id, { url: api().urlOf(link.url), expiresAt: link.expiresAt }]),
  );
}

export async function updateAssistantSettings(
  change: AssistantSettingsChange,
): Promise<AssistantStatus> {
  const status = await api().call(E.updateAssistantSettings, { body: change });
  log.info('assistant.settings_updated', { fields: Object.keys(change) });
  return status;
}

export async function connectAssistantApp(app: ResponderApp): Promise<AssistantStatus> {
  const status = await api().call(E.connectAssistantApp, { params: { app } });
  log.info('assistant.app_connected', { app });
  return status;
}

export async function disconnectAssistantApp(app: ResponderApp): Promise<AssistantStatus> {
  const status = await api().call(E.disconnectAssistantApp, { params: { app } });
  log.info('assistant.app_disconnected', { app });
  return status;
}

export async function openClaudeDesktop(): Promise<void> {
  await api().call(E.openAssistantConversation, {});
  log.info('assistant.claude_desktop_opened', {});
}
