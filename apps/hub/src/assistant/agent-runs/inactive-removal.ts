import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ChatOwner } from '../chat-directory';
import type { EngineStatus } from '../engines/engine';

interface InactiveRemoval {
  readonly store: Pick<Store, 'host'>;
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly runId?: string;
  readonly status: (chat: AiChatRow) => EngineStatus | null;
}

export async function removalNeedsInactive(
  store: Pick<Store, 'host'>,
  chatId: string,
  requested: boolean,
): Promise<boolean> {
  return requested || (await store.host.read('assistantRemovalNeedsInactive', { chatId }));
}

export async function admitInactiveRemoval(
  deps: InactiveRemoval,
  scope: readonly AiChatRow[],
): Promise<void> {
  const { chats, busy } = await deps.store.host.read('assistantInactiveRemoval', {
    profileId: deps.owner.profileId,
    chatId: deps.chatId,
    runId: deps.runId ?? null,
    scope: scope.map((chat) => chat.id),
  });
  if (busy || chats.some((chat) => deps.status(chat)?.state === 'working'))
    throw new ApiError('conflict', 'This child conversation is still working, so it was kept.');
}
