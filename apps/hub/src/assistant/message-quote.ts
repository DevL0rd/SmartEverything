import {
  ApiError,
  helperDialogueOf,
  messageQuoteOf,
  type AiChatRow,
  type AssistantMessageRow,
  type MessageQuote,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export function quotedMessage(
  store: Store,
  chat: Pick<AiChatRow, 'id' | 'profile_id'>,
  id: string,
): AssistantMessageRow {
  const row = store.assistantChat.find(id);
  if (row?.chat_id !== chat.id || row.profile_id !== chat.profile_id)
    throw new ApiError('invalid_request', 'Quote a message that is in this chat.');
  return row;
}

export function quoteForChat(
  store: Store,
  chat: Pick<AiChatRow, 'id' | 'profile_id'>,
  id: string | undefined,
): MessageQuote | null {
  return id === undefined ? null : messageQuoteOf(quotedMessage(store, chat, id));
}

export function helperAnswerQuote(
  store: Store,
  parent: AiChatRow,
  target: AiChatRow,
  id: string | null,
): AssistantMessageRow | null {
  if (id === null) return null;
  const quote = store.assistantChat.find(id);
  const dialogue = quote === undefined ? undefined : helperDialogueOf(quote);
  if (
    quote?.chat_id !== parent.id ||
    quote.profile_id !== parent.profile_id ||
    dialogue?.direction !== 'from_helper' ||
    dialogue.helper_chat_id !== target.id
  )
    throw new ApiError(
      'invalid_request',
      'Choose a message from this helper in this conversation.',
    );
  return quote;
}
