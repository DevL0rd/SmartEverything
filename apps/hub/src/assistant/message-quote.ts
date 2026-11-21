import {
  ApiError,
  helperDialogueOf,
  messageQuoteOf,
  type AiChatRow,
  type AssistantMessageRow,
  type MessageQuote,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';

export function quotedMessage(
  store: HostStore,
  chat: Pick<AiChatRow, 'id' | 'profile_id'>,
  id: string,
): AssistantMessageRow {
  const row = store.assistantChat.find(id);
  if (row?.chat_id !== chat.id || row.profile_id !== chat.profile_id)
    throw new ApiError('invalid_request', 'Quote a message that is in this chat.');
  return row;
}

export function quoteForChat(
  store: HostStore,
  chat: Pick<AiChatRow, 'id' | 'profile_id'>,
  id: string | undefined,
): MessageQuote | null {
  return id === undefined ? null : messageQuoteOf(quotedMessage(store, chat, id));
}

export function helperAnswerQuote(
  store: HostStore,
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

export interface QuoteRequest {
  readonly chat: Pick<AiChatRow, 'id' | 'profile_id'>;
  readonly id: string | undefined;
}

export interface HelperQuoteRequest {
  readonly parent: AiChatRow;
  readonly target: AiChatRow;
  readonly id: string | null;
}

export const QUOTE_UNIT = storeUnit((store, input: QuoteRequest) =>
  quoteForChat(store, input.chat, input.id),
);
export const HELPER_QUOTE_UNIT = storeUnit((store, input: HelperQuoteRequest) =>
  helperAnswerQuote(store, input.parent, input.target, input.id),
);
