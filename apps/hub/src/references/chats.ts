import { ApiError, type AiReference } from '@smarteverything/domain';
import { reachesChat } from '../assistant/chat-directory';
import { confinedChatOf } from '../server/auth';
import type { Store } from '../store/store';
import type { ReferenceContext, ReferenceMatches } from './contracts';
import { rankMatches } from './rank';

const CHAT_MAX = 5000;
const CHAT_LABELS = {
  chat: 'Chat',
  plugin: 'Plugin chat',
  subagent: 'Subagent chat',
  call: 'Call chat',
} as const;

export function searchChats(
  store: Store,
  context: ReferenceContext,
  options: { readonly query: string; readonly limit: number },
): ReferenceMatches {
  const confinedTo = confinedChatOf(context.caller);
  const rows = store.aiChats.referenceTitles({
    profileId: context.authority.profileId,
    after: null,
    limit: CHAT_MAX,
  });
  const ranked = rankMatches(rows, options.query, (row) => ({
    title: row.title,
    extra: CHAT_LABELS[row.kind],
  })).filter(
    (row) => confinedTo === undefined || reachesChat(store, confinedTo, store.aiChats.chat(row.id)),
  );
  return {
    items: ranked.slice(0, options.limit).map((row) => ({
      reference: { kind: 'chat', chat_id: row.id },
      label: row.title,
      subtitle: `${row.archived ? 'Archived · ' : ''}${CHAT_LABELS[row.kind]} · ${row.id}`,
    })),
    incomplete: ranked.length > options.limit || rows.length >= CHAT_MAX,
  };
}

export function resolveChat(
  store: Store,
  context: ReferenceContext,
  reference: Extract<AiReference, { kind: 'chat' }>,
): void {
  const chat = store.aiChats.chat(reference.chat_id);
  if (
    chat.profile_id !== context.authority.profileId ||
    !reachesChat(store, confinedChatOf(context.caller), chat)
  )
    throw new ApiError('forbidden', 'The referenced chat belongs to a different profile.');
  store.aiChats.assertWorkAllowed(chat.id);
  if (
    reference.message_id !== undefined &&
    !store.aiChats.ownsReferenceMessage({
      chatId: chat.id,
      messageId: reference.message_id,
      profileId: chat.profile_id,
    })
  )
    throw new ApiError(
      'forbidden',
      'The referenced message is no longer available in this owned chat.',
    );
}
