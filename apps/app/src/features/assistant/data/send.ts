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

export async function sendMessageRow(
  text: string,
  attachments: readonly string[],
): Promise<AssistantMessageRow | null> {
  try {
    const row = await sendAssistantMessage(text.trim(), attachments);
    clearUploads();
    return row;
  } catch (error) {
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
    return;
  }
  retrying.add(request.id);
  try {
    await retryAiChatMessage(request.chat_id, request.id, from);
  } catch (error) {
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
  try {
    const message = trimmedReferences({ text, references });
    await editAiChatMessage(request.chat_id, request.id, message.text, {
      references: message.references,
    });
    return true;
  } catch (error) {
    notify({ message: 'Message not edited', error, tone: 'critical' });
    return false;
  }
}

export async function branchFromMessage(row: AssistantMessageRow): Promise<AiChatRow | null> {
  try {
    return await branchAiChat(row.chat_id, row.id);
  } catch (error) {
    notify({ message: 'Chat not branched', error, tone: 'critical' });
    return null;
  }
}
