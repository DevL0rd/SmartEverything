import { Logger } from '@smarteverything/logging';
import type {
  AiChatRow,
  AiRetryFrom,
  AssistantMessageRow,
  AiMessageReference,
} from '@smarteverything/domain';
import { branchAiChat, editAiChatMessage, retryAiChatMessage } from '../../../api/ai';
import { sendAssistantMessage } from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { trimmedReferences } from '../references/spans';
import { clearUploads } from './uploads';

const log = new Logger('app.assistant');

async function sendMessageRow(
  text: string,
  attachments: readonly string[],
): Promise<AssistantMessageRow | null> {
  const operation = log.operation('assistant_message.send', {
    length: text.length,
    attachments: attachments.length,
  });
  try {
    const row = await sendAssistantMessage(text.trim(), attachments);
    clearUploads();
    operation.succeeded({ messageId: row.id, chatId: row.chat_id });
    return row;
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Message not sent', error, tone: 'critical' });
    return null;
  }
}

export async function sendMessage(text: string, attachments: readonly string[]): Promise<boolean> {
  return (await sendMessageRow(text, attachments)) !== null;
}

const retrying = new Set<string>();

export async function retryMessage(request: AssistantMessageRow, from: AiRetryFrom): Promise<void> {
  if (retrying.has(request.id)) {
    log.debug('message.retry_skipped', { chatId: request.chat_id, messageId: request.id });
    return;
  }
  retrying.add(request.id);
  const operation = log.operation('message.retry', {
    chatId: request.chat_id,
    messageId: request.id,
    from,
  });
  try {
    await retryAiChatMessage(request.chat_id, request.id, from);
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Message not retried', error, tone: 'critical' });
  } finally {
    retrying.delete(request.id);
  }
}

export async function editMessage(
  request: AssistantMessageRow,
  text: string,
  references: readonly AiMessageReference[] = [],
): Promise<boolean> {
  const operation = log.operation('message.edit', {
    chatId: request.chat_id,
    messageId: request.id,
    length: text.length,
    references: references.length,
  });
  try {
    const message = trimmedReferences({ text, references });
    await editAiChatMessage(request.chat_id, request.id, message.text, {
      references: message.references,
    });
    operation.succeeded();
    return true;
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Message not edited', error, tone: 'critical' });
    return false;
  }
}

export async function branchFromMessage(row: AssistantMessageRow): Promise<AiChatRow | null> {
  const operation = log.operation('chat.branch', { chatId: row.chat_id, messageId: row.id });
  try {
    const branch = await branchAiChat(row.chat_id, row.id);
    operation.succeeded({ branchId: branch.id });
    return branch;
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Chat not branched', error, tone: 'critical' });
    return null;
  }
}
