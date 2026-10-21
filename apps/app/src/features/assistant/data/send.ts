import { Logger } from '@smarteverything/logging';
import type { AiChatRow, AssistantMessageRow, AiMessageReference } from '@smarteverything/domain';
import { branchAiChat, editAiChatMessage, retryAiChatMessage } from '../../../api/ai';
import { sendAssistantMessage } from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { trimmedReferences } from '../references/spans';
import { OUTBOX_RETRY_MS } from './outbox';
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
    return null;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

export async function sendMessage(text: string, attachments: readonly string[]): Promise<boolean> {
  while ((await sendMessageRow(text, attachments)) === null) await pause(OUTBOX_RETRY_MS);
  return true;
}

const continuing = new Set<string>();

export async function continueMessage(request: AssistantMessageRow): Promise<void> {
  if (continuing.has(request.id)) {
    log.debug('message.continue_skipped', { chatId: request.chat_id, messageId: request.id });
    return;
  }
  continuing.add(request.id);
  const operation = log.operation('message.continue', {
    chatId: request.chat_id,
    messageId: request.id,
  });
  try {
    await retryAiChatMessage(request.chat_id, request.id, 'failed');
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    notify({ message: 'Message not continued', error, tone: 'critical' });
  } finally {
    continuing.delete(request.id);
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
