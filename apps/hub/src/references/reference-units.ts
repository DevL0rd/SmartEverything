import { ApiError, type AiReference } from '@smarteverything/domain';
import { reachesChat } from '../assistant/chat-ownership';
import { admitExecutionTool } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { storeUnit } from '../store/host/unit';
import type { ReferenceMatches } from './contracts';
import { rankMatches } from './rank';

const CHAT_MAX = 5000;
const CHAT_LABELS = {
  chat: 'Chat',
  plugin: 'Plugin chat',
  subagent: 'Subagent chat',
  call: 'Call chat',
} as const;

export interface ReferenceChatSearch {
  readonly profileId: string;
  readonly confinedTo: string | null | undefined;
  readonly query: string;
  readonly limit: number;
}

export interface ReferenceChatResolve {
  readonly profileId: string;
  readonly confinedTo: string | null | undefined;
  readonly reference: Extract<AiReference, { kind: 'chat' }>;
}

export const REFERENCE_SEARCH_ADMISSION_UNIT = storeUnit(
  (store, { authority }: { readonly authority: ConversationAuthority }): null => {
    admitExecutionTool(store, 'reference_search', authority);
    return null;
  },
);

export const REFERENCE_CHATS_UNIT = storeUnit(
  (store, search: ReferenceChatSearch): ReferenceMatches => {
    const { confinedTo } = search;
    const rows = store.aiChats.referenceTitles({
      profileId: search.profileId,
      after: null,
      limit: CHAT_MAX,
    });
    const ranked = rankMatches(rows, search.query, (row) => ({
      title: row.title,
      extra: CHAT_LABELS[row.kind],
    })).filter(
      (row) =>
        confinedTo === undefined || reachesChat(store, confinedTo, store.aiChats.chat(row.id)),
    );
    return {
      items: ranked.slice(0, search.limit).map((row) => ({
        reference: { kind: 'chat', chat_id: row.id },
        label: row.title,
        subtitle: `${row.archived ? 'Archived · ' : ''}${CHAT_LABELS[row.kind]} · ${row.id}`,
      })),
      incomplete: ranked.length > search.limit || rows.length >= CHAT_MAX,
    };
  },
);

export const REFERENCE_CHAT_RESOLVE_UNIT = storeUnit(
  (store, { profileId, confinedTo, reference }: ReferenceChatResolve): null => {
    const chat = store.aiChats.chat(reference.chat_id);
    if (chat.profile_id !== profileId || !reachesChat(store, confinedTo, chat))
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
    return null;
  },
);
