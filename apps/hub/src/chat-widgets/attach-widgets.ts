import {
  chatWidgetsOf,
  newChatWidgets,
  type AssistantMessageRow,
  type ChatWidget,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const RECENT_MESSAGES = 6;

export function workingReply(store: Store, chatId: string): AssistantMessageRow | null {
  return (
    store.assistantChat
      .messages({ chatId, limit: RECENT_MESSAGES })
      .find((row) => row.role === 'responder' && row.state === 'working') ?? null
  );
}

export function attachWidgets(
  store: Store,
  reply: AssistantMessageRow,
  widgets: readonly ChatWidget[],
): number {
  const current = store.assistantChat.message(reply.id);
  const fresh = newChatWidgets(chatWidgetsOf(current.embeds), widgets);
  if (fresh.length > 0) {
    store.assistantChat.updateMessage(reply.id, { embeds: [...current.embeds, ...fresh] });
  }
  return fresh.length;
}
