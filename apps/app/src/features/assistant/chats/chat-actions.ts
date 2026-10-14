import {
  NEW_CHAT_TITLE,
  type AiChatChange,
  type AiChatNew,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';
import {
  compactAiChat,
  createAiChat,
  interruptAiChat,
  removeAiChat,
  sendAiChatMessage,
  updateAiChat,
} from '../../../api/ai';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import type { MessageSender } from '../components/composer';
import { trimmedReferences } from '../references/spans';
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

export async function setChatPinned(chatId: string, pinned: boolean): Promise<void> {
  await changeChat(chatId, { pinned });
}

export async function setChatRead(chatId: string, read: boolean): Promise<void> {
  await changeChat(chatId, { read });
}

export async function setChatArchived(chatId: string, archived: boolean): Promise<void> {
  const row = await changeChat(chatId, { archived });
  if (row === null || !archived) {
    return;
  }
  notify({
    message: 'Chat archived',
    detail: row.title,
    action: {
      label: 'Undo',
      onPress: (): void => {
        void changeChat(chatId, { archived: false });
      },
    },
  });
}

export async function deleteChat(chat: Pick<AiChatRow, 'id' | 'title'>): Promise<boolean> {
  const sure = await confirm({
    title: `Delete “${chat.title}”?`,
    body: 'Its messages, attachments and spawned subagent chats are deleted too.',
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

export function chatSender(chatId: string): MessageSender {
  return async (text, attachments, references = [], clientMessageId) => {
    const message = trimmedReferences({ text, references });
    const sent = await attempt(
      () =>
        sendAiChatMessage(chatId, message.text, attachments, {
          references: message.references,
          ...(clientMessageId === undefined ? {} : { clientMessageId }),
        }),
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
  resolve?: () => Engine | null,
): MessageSender {
  return async (text, attachments, references = [], clientMessageId) => {
    const selected = resolve === undefined ? engine : resolve();
    if (selected === null) {
      notify({
        message: 'The selected device is unavailable. Check Machine before sending.',
        tone: 'critical',
      });
      return false;
    }
    const chat = await newChat({ title: NEW_CHAT_TITLE, engine: selected });
    if (chat === null) {
      return false;
    }
    const sent = await chatSender(chat.id)(text, attachments, references, clientMessageId);
    opened(chat.id);
    return sent;
  };
}

export async function compactChat(chatId: string): Promise<void> {
  const result = await attempt(() => compactAiChat(chatId), 'Chat could not be compacted');
  if (result === null) return;
  notify({ message: result ? 'Chat compacted' : 'Nothing needed compacting' });
}
