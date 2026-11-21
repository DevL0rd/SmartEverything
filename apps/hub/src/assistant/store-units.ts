import { assistantLabel, isChatActivity, type AssistantMessageRow } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';
import type { NewEvent, StoredEvent } from '../store/repositories/assistant-events';
import { type AuthorityScope } from './turn-authority';
import { issueEventAuthority } from './event-authority-issue';
import {
  personMessage,
  responderMessage,
  type PersonMessage,
  type ResponderMessage,
} from './conversation-log';

export interface ConversationMessageInput {
  readonly row: NewAssistantMessage;
  readonly files: readonly string[];
  readonly messageId?: string;
}

export function addConversationMessage(
  store: HostStore,
  input: ConversationMessageInput,
): AssistantMessageRow {
  return store.write(() => {
    const added = store.assistantChat.addMessage(input.row, undefined, input.messageId);
    store.assistantChat.attachTo(added.id, input.files);
    if (isChatActivity(input.row)) store.aiChats.touched(input.row.chat_id, 0);
    return added;
  });
}

export function addPersonMessage(store: HostStore, input: PersonMessage): AssistantMessageRow {
  return addConversationMessage(store, {
    row: personMessage(input),
    files: input.files.map((file) => file.id),
    ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
  });
}

export function addResponderMessage(
  store: HostStore,
  input: ResponderMessage,
): AssistantMessageRow {
  return addConversationMessage(store, {
    row: responderMessage(input, () => assistantLabel(store.assistantChat.settings())),
    files: (input.files ?? []).map((file) => file.id),
    ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
  });
}

export interface QueuedEventInput {
  readonly event: NewEvent;
  readonly scope: AuthorityScope;
}

export function queueEventNow(store: HostStore, input: QueuedEventInput): StoredEvent {
  return store.write(() => {
    const event = store.assistantEvents.add(input.event);
    issueEventAuthority(store, event, input.scope);
    return event;
  });
}

export interface SentMessageInput {
  readonly message: ConversationMessageInput;
  readonly clientMessageId: string | null;
  readonly event: Omit<NewEvent, 'message_id'>;
  readonly scope: AuthorityScope;
}

export type SentMessage =
  | { readonly duplicate: true; readonly row: AssistantMessageRow }
  | { readonly duplicate: false; readonly row: AssistantMessageRow; readonly event: StoredEvent };

function sentMessage(store: HostStore, input: SentMessageInput): SentMessage {
  const chatId = input.message.row.chat_id;
  const sent =
    input.clientMessageId === null
      ? undefined
      : store.assistantSearch.byClientMessageId(chatId, input.clientMessageId);
  if (sent !== undefined) return { duplicate: true, row: sent };
  const row = addConversationMessage(store, input.message);
  const event = queueEventNow(store, {
    event: { ...input.event, message_id: row.id },
    scope: input.scope,
  });
  store.aiChats.update(chatId, { read: true });
  return { duplicate: false, row, event };
}

export interface MessageEventInput {
  readonly message: ConversationMessageInput;
  readonly event: Omit<NewEvent, 'message_id'>;
  readonly scope: AuthorityScope;
}

function messageEvent(
  store: HostStore,
  input: MessageEventInput,
): { readonly row: AssistantMessageRow; readonly event: StoredEvent } {
  const row = addConversationMessage(store, input.message);
  const event = queueEventNow(store, {
    event: { ...input.event, message_id: row.id },
    scope: input.scope,
  });
  return { row, event };
}

export const MESSAGE_ADD_UNIT = storeUnit(addConversationMessage);
export const EVENT_QUEUE_UNIT = storeUnit(queueEventNow);
export const MESSAGE_SEND_UNIT = storeUnit(sentMessage);
export const MESSAGE_EVENT_UNIT = storeUnit(messageEvent);
