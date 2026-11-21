import { ApiError, helperDialogueOf, type AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { HostStore } from '../store/host/host-store';
import { storeUnit } from '../store/host/unit';
import { helperParentMessageId } from './delegation/helper-delivery';

export function reactionForbidden(): ApiError {
  return new ApiError(
    'forbidden',
    'Choose an input currently delivered to you from your parent conversation.',
  );
}

function deliveredInput(store: HostStore, chat: AiChatRow, messageId: string): StoredEvent {
  const event = store.assistantEvents.ofMessage(messageId);
  if (
    event?.chat_id !== chat.id ||
    event.profile_id !== chat.profile_id ||
    event.kind !== 'chat' ||
    event.delivered_at === null ||
    event.answered_at !== null
  )
    throw reactionForbidden();
  return event;
}

function parentProjection(
  store: HostStore,
  link: {
    readonly parent: AiChatRow;
    readonly child: AiChatRow;
    readonly event: StoredEvent;
  },
): string {
  const id = helperParentMessageId(link.event);
  if (id === null) throw reactionForbidden();
  const message = store.assistantChat.find(id);
  if (
    message?.chat_id !== link.parent.id ||
    message.profile_id !== link.parent.profile_id ||
    helperDialogueOf(message)?.helper_chat_id !== link.child.id
  )
    throw reactionForbidden();
  return id;
}

export interface ParentReaction {
  readonly parent: AiChatRow;
  readonly event: StoredEvent;
  readonly messageId: string;
}

export const PARENT_REACTION_READ_UNIT = storeUnit(
  (store, input: { readonly chat: AiChatRow; readonly childMessageId: string }): ParentReaction => {
    const { chat } = input;
    if (chat.kind !== 'subagent' || chat.parent_id === null) throw reactionForbidden();
    const parent = store.aiChats.find(chat.parent_id);
    if (parent?.profile_id !== chat.profile_id) throw reactionForbidden();
    const event = deliveredInput(store, chat, input.childMessageId);
    const messageId = parentProjection(store, { parent, child: chat, event });
    return { parent, event, messageId };
  },
);
