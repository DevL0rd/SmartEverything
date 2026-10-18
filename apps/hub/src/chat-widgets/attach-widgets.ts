import {
  CHAT_WIDGETS_MAX,
  chatWidgetKey,
  chatWidgetsOf,
  newChatWidgets,
  type AssistantMessageRow,
  type ChatWidget,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const RECENT_MESSAGES = 6;

export interface AttachedWidgets {
  readonly added: number;
  readonly dropped: readonly string[];
}

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
): AttachedWidgets {
  const current = store.assistantChat.message(reply.id);
  const known = chatWidgetsOf(current.embeds);
  const fresh = newChatWidgets(known, widgets);
  const room = Math.max(0, CHAT_WIDGETS_MAX - known.length);
  const shown = fresh.slice(0, room);
  if (shown.length > 0) {
    store.assistantChat.updateMessage(reply.id, { embeds: [...current.embeds, ...shown] });
  }
  return { added: shown.length, dropped: fresh.slice(room).map(chatWidgetKey) };
}
