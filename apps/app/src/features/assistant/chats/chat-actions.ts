import { Logger, background } from '@smarteverything/logging';
import type { AiChatChange, AiChatRow } from '@smarteverything/domain';
import { compactAiChat, interruptAiChat, removeAiChat, updateAiChat } from '../../../api/ai';
import { deferAction } from '../../../components/deferred-action';
import { notify } from '../../../components/toast-store';
import { forgetBrowserChat } from '../browser/browser-runtime';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { chatAfter } from './chat-prediction';

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

export async function changeChat(
  store: EntityStore,
  chatId: string,
  change: AiChatChange,
): Promise<AiChatRow | null> {
  const previous = store.get().tables.ai_chats.byId[chatId] ?? null;
  const edits =
    previous === null
      ? []
      : [liveRowEdit('ai_chats', chatId, previous, chatAfter(previous, change, new Date()))];
  try {
    return await writeOptimistically(store, {
      event: 'chat.update',
      edits: edits,
      send: () => updateAiChat(chatId, change),
      fields: { chatId, fields: Object.keys(change).join(',') },
    });
  } catch (error) {
    notify({ message: 'Chat not changed', error, tone: 'critical' });
    return null;
  }
}

export async function setChatPinned(
  store: EntityStore,
  chatId: string,
  pinned: boolean,
): Promise<void> {
  await changeChat(store, chatId, { pinned });
}

export async function setChatRead(
  store: EntityStore,
  chatId: string,
  read: boolean,
): Promise<void> {
  await changeChat(store, chatId, { read });
}

export function setChatArchived(store: EntityStore, chatId: string, archived: boolean): void {
  if (!archived) {
    background(changeChat(store, chatId, { archived: false }), 'chat.change_failed');
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
