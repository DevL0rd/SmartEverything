import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';

export async function chatCaller(
  store: Store,
  caller: Caller,
  chat: string,
  what: string,
): Promise<string> {
  const profile = profileIdOf(caller);
  if (
    (await store.host.call('aiChats', 'chat', chat)).profile_id !== profile ||
    ((caller.kind === 'client' || caller.kind === 'service') &&
      caller.chatId !== undefined &&
      caller.chatId !== null &&
      caller.chatId !== chat)
  )
    throw new ApiError('forbidden', `${what} must remain in the initiating chat and profile.`);
  return profile;
}
