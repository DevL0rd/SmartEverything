import type { AiChatRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { localPref, setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { useSyncStatus } from '../../../store/selectors';
import { useAiChat } from './chat-store';

const log = new Logger('app.assistant');

export type LastChat =
  | { readonly kind: 'none' }
  | { readonly kind: 'open'; readonly chatId: string }
  | { readonly kind: 'pending'; readonly chatId: string }
  | { readonly kind: 'gone'; readonly chatId: string };

export function isOpenChat(chat: AiChatRow | null): chat is AiChatRow {
  return chat !== null && chat.archived_at === null;
}

export function useLastChat(): LastChat {
  const chatId = useLocalPref('lastChat');
  const chat = useAiChat(chatId);
  const live = useSyncStatus().status === 'live';
  if (chatId === null) {
    return { kind: 'none' };
  }
  if (isOpenChat(chat)) {
    return { kind: 'open', chatId };
  }
  return live ? { kind: 'gone', chatId } : { kind: 'pending', chatId };
}

export function rememberChat(chatId: string): void {
  if (localPref('lastChat') !== chatId) {
    setLocalPref('lastChat', chatId);
  }
}

export function forgetGoneChat(last: Extract<LastChat, { kind: 'gone' }>): void {
  log.info('last_chat.gone', { chatId: last.chatId });
  setLocalPref('lastChat', null);
}
