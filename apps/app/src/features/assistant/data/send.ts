import type { AssistantMessageRow } from '@smarteverything/domain';
import { sendAiChatMessage } from '../../../api/ai';
import { sendAssistantMessage } from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { clearUploads } from './uploads';

export async function sendMessage(text: string, attachments: readonly string[]): Promise<boolean> {
  try {
    await sendAssistantMessage(text.trim(), attachments);
    clearUploads();
    return true;
  } catch (error) {
    notify({ message: 'Message not sent', error, tone: 'critical' });
    return false;
  }
}

export async function resend(request: AssistantMessageRow): Promise<void> {
  try {
    await sendAiChatMessage(
      request.chat_id,
      request.text,
      request.attachments.map((attachment) => attachment.id),
    );
  } catch (error) {
    notify({ message: 'Message not sent', error, tone: 'critical' });
  }
}
