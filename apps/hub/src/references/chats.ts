import { ApiError, type AiReference, type AiReferenceSummary } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type {
  ReferenceContext,
  ReferenceSource,
  ReferenceSearchProgress,
  ReferencePage,
} from './contracts';

const CHAT_WINDOW = 128;
const CHAT_LABELS = {
  chat: 'Chat',
  plugin: 'Plugin chat',
  subagent: 'Subagent chat',
  call: 'Call chat',
} as const;

export function chatReferenceSource(store: Store): ReferenceSource {
  return {
    kind: 'chat',
    status: () => ({ kind: 'chat', state: 'available' }),
    open: (_context, request): Promise<ReferenceSearchProgress> => {
      let after: string | null = null;
      return Promise.resolve({
        close: (): Promise<void> => Promise.resolve(),
        next: (context, limit): Promise<ReferencePage> => {
          context.validate();
          const rows = store.aiChats.referenceTitles({
            profileId: context.authority.profileId,
            after,
            limit: CHAT_WINDOW,
          });
          const items: AiReferenceSummary[] = [];
          let examined = 0;
          for (const row of rows) {
            examined += 1;
            after = row.id;
            if (row.title.toLocaleLowerCase().includes(request.query.toLocaleLowerCase()))
              items.push({
                reference: { kind: 'chat', chat_id: row.id },
                label: row.title,
                subtitle: `${row.archived ? 'Archived · ' : ''}${CHAT_LABELS[row.kind]} · ${row.id}`,
              });
            if (items.length >= limit) break;
          }
          const complete = examined === rows.length && rows.length < CHAT_WINDOW;
          return Promise.resolve({ items, complete, incomplete: !complete });
        },
      });
    },
    resolve: (context, reference): Promise<AiReference> =>
      Promise.resolve(resolveChat(store, context, reference)),
  };
}

function resolveChat(store: Store, context: ReferenceContext, reference: AiReference): AiReference {
  context.validate();
  if (reference.kind !== 'chat')
    throw new ApiError('invalid_request', 'Expected a chat reference.');
  const chat = store.aiChats.chat(reference.chat_id);
  if (chat.profile_id !== context.authority.profileId)
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
  return reference;
}
