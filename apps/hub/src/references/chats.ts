import type { AiReference } from '@smarteverything/domain';
import { confinedChatOf } from '../server/auth';
import type { Store } from '../store/store';
import type { ReferenceContext, ReferenceMatches } from './contracts';

export function searchChats(
  store: Store,
  context: ReferenceContext,
  options: { readonly query: string; readonly limit: number },
): Promise<ReferenceMatches> {
  return store.host.read('referenceChats', {
    profileId: context.authority.profileId,
    confinedTo: confinedChatOf(context.caller),
    query: options.query,
    limit: options.limit,
  });
}

export async function resolveChat(
  store: Store,
  context: ReferenceContext,
  reference: Extract<AiReference, { kind: 'chat' }>,
): Promise<void> {
  await store.host.read('referenceChatResolve', {
    profileId: context.authority.profileId,
    confinedTo: confinedChatOf(context.caller),
    reference,
  });
  store.live.chatWork.holds.assertWork(reference.chat_id);
}
