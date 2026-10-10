import type { WakeAiAction } from '@smarteverything/domain';
import type { ActionOrigin } from '../automations/actions';
import type { Store } from '../store/store';
import { unlessGone } from './unless-gone';

export type WakeRefusalStore = Pick<Store, 'profiles' | 'aiChats'>;

export interface WakeRefusal {
  readonly reason: string;
  readonly recorded: boolean;
}

function chatRefusal(
  store: WakeRefusalStore,
  action: WakeAiAction,
  chatId: string,
): WakeRefusal | null {
  const chat = unlessGone(() => store.aiChats.chat(chatId));
  if (chat?.profile_id !== action.profileId) {
    return { reason: 'The chat it wakes was deleted or belongs to someone else.', recorded: true };
  }
  return chat.archived_at === null
    ? null
    : { reason: `The chat “${chat.title}” is archived.`, recorded: true };
}

export function wakeRefusal(
  store: WakeRefusalStore,
  action: WakeAiAction,
  origin: ActionOrigin,
): WakeRefusal | null {
  if (!store.profiles.list().some((profile) => profile.id === action.profileId)) {
    return { reason: 'The person it wakes the AI for was removed.', recorded: false };
  }
  if (action.chatId === null) {
    return null;
  }
  const signal = origin.signal;
  if (signal?.source === 'assistant' && signal.subject === action.chatId) {
    return {
      reason: 'It would wake the same chat that just answered, which would repeat forever.',
      recorded: true,
    };
  }
  return chatRefusal(store, action, action.chatId);
}
