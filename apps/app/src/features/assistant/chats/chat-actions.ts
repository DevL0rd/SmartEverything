import { Logger, background } from '@smarteverything/logging';
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
  updateAiChat,
} from '../../../api/ai';
import { deferAction } from '../../../components/deferred-action';
import { notify } from '../../../components/toast-store';
import type { MessageSender } from '../components/composer';
import { outboxSender } from '../data/outbox';
import { forgetBrowserChat } from '../browser/browser-runtime';

const log = new Logger('app.chat');

async function attempt<T>(
  operationName: string,
  ids: Readonly<Record<string, unknown>>,
  work: () => Promise<T>,
  failure: string,
): Promise<T | null> {
  const operation = log.operation(operationName, ids);
  try {
    const result = await work();
    operation.succeeded();
    return result;
  } catch (error) {
    operation.failed(error, { failure });
    notify({ message: failure, error, tone: 'critical' });
    return null;
  }
}

function newChat(chat: AiChatNew): Promise<AiChatRow | null> {
  return attempt(
    'chat.create',
    { engineKind: chat.engine?.kind ?? null },
    () => createAiChat(chat),
    'Chat not created',
  );
}

export function changeChat(chatId: string, change: AiChatChange): Promise<AiChatRow | null> {
  return attempt(
    'chat.update',
    { chatId, fields: Object.keys(change).join(',') },
    () => updateAiChat(chatId, change),
    'Chat not changed',
  );
}

export async function setChatPinned(chatId: string, pinned: boolean): Promise<void> {
  await changeChat(chatId, { pinned });
}

export async function setChatRead(chatId: string, read: boolean): Promise<void> {
  await changeChat(chatId, { read });
}

export function setChatArchived(chatId: string, archived: boolean): void {
  if (!archived) {
    background(changeChat(chatId, { archived: false }), 'chat.change_failed');
    return;
  }
  log.info('chat.archive_deferred', { chatId });
  deferAction({
    key: chatId,
    message: 'Chat archived',
    failure: 'Chat not archived',
    commit: async () => {
      const operation = log.operation('chat.archive', { chatId });
      try {
        await updateAiChat(chatId, { archived: true });
        operation.succeeded();
      } catch (error) {
        operation.failed(error);
        throw error;
      }
    },
  });
}

export function deleteChat(chat: Pick<AiChatRow, 'id'>): void {
  log.info('chat.delete_deferred', { chatId: chat.id });
  deferAction({
    key: chat.id,
    message: 'Chat deleted',
    failure: 'Chat not deleted',
    commit: async () => {
      const operation = log.operation('chat.delete', { chatId: chat.id });
      try {
        await removeAiChat(chat.id);
        forgetBrowserChat(chat.id);
        operation.succeeded();
      } catch (error) {
        operation.failed(error);
        throw error;
      }
    },
  });
}

export async function stopChat(chatId: string): Promise<void> {
  await attempt('chat.stop', { chatId }, () => interruptAiChat(chatId), 'Couldn’t stop it');
}

export function chatStarter(
  engine: Engine,
  opened: (chatId: string) => void,
  resolve?: () => Engine | null,
): MessageSender {
  return async (text, attachments, references = [], clientMessageId) => {
    const selected = resolve === undefined ? engine : resolve();
    if (selected === null) {
      log.warn('chat.start_blocked', { reason: 'machine-offline', requested: engine.kind });
      notify({
        message: 'That machine is offline. Switch machine to send.',
        tone: 'critical',
      });
      return false;
    }
    const chat = await newChat({ title: NEW_CHAT_TITLE, engine: selected });
    if (chat === null) {
      return false;
    }
    log.info('chat.started', { chatId: chat.id, engineKind: selected.kind });
    const sent = await outboxSender(chat.id, true)(text, attachments, references, clientMessageId);
    opened(chat.id);
    return sent;
  };
}

export async function compactChat(chatId: string): Promise<void> {
  const result = await attempt(
    'chat.compact',
    { chatId },
    () => compactAiChat(chatId),
    'Chat could not be compacted',
  );
  if (result === null) return;
  notify({ message: result ? 'Chat compacted' : 'Nothing needed compacting' });
}
