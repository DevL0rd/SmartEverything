import {
  NEW_CHAT_TITLE,
  type AiChatChange,
  type AiChatNew,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';
import {
  createAiChat,
  interruptAiChat,
  removeAiChat,
  sendAiChatMessage,
  updateAiChat,
} from '../../../api/ai';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { clearUploads } from '../data/uploads';

async function attempt<T>(work: () => Promise<T>, failure: string): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    notify({ message: failure, error, tone: 'critical' });
    return null;
  }
}

export function newChat(chat: AiChatNew): Promise<AiChatRow | null> {
  return attempt(() => createAiChat(chat), 'Chat not created');
}

export function changeChat(chatId: string, change: AiChatChange): Promise<AiChatRow | null> {
  return attempt(() => updateAiChat(chatId, change), 'Chat not changed');
}

export async function deleteChat(chat: AiChatRow): Promise<boolean> {
  const sure = await confirm({
    title: `Delete “${chat.title}”?`,
    body: 'Its messages and attachments are deleted too.',
    confirmLabel: 'Delete',
    tone: 'destructive',
  });
  if (!sure) {
    return false;
  }
  return (await attempt(() => removeAiChat(chat.id), 'Chat not deleted')) !== null;
}

export async function stopChat(chatId: string): Promise<void> {
  await attempt(() => interruptAiChat(chatId), 'Couldn’t stop it');
}

export function chatSender(
  chatId: string,
): (text: string, attachments: readonly string[]) => Promise<boolean> {
  return async (text, attachments) => {
    const sent = await attempt(
      () => sendAiChatMessage(chatId, text.trim(), attachments),
      'Message not sent',
    );
    if (sent !== null) {
      clearUploads();
    }
    return sent !== null;
  };
}

export function chatStarter(
  engine: Engine,
  opened: (chatId: string) => void,
): (text: string, attachments: readonly string[]) => Promise<boolean> {
  return async (text, attachments) => {
    const chat = await newChat({ title: NEW_CHAT_TITLE, engine });
    if (chat === null) {
      return false;
    }
    const sent = await chatSender(chat.id)(text, attachments);
    opened(chat.id);
    return sent;
  };
}
