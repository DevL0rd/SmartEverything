import type { Store } from '../store/store';
import type { AssistantService } from './service';

export async function removeProfileChats(
  store: Pick<Store, 'host'>,
  assistant: Pick<AssistantService, 'removeChat'>,
  profileId: string,
): Promise<void> {
  const chats = [
    ...(await store.host.call('aiChats', 'chats', { profileId, archived: false })),
    ...(await store.host.call('aiChats', 'chats', { profileId, archived: true })),
  ];
  const removed = new Set<string>();
  for (const chat of chats) {
    if (removed.has(chat.id)) continue;
    const scope = await store.host.call('aiChats', 'removalIds', chat.id);
    await assistant.removeChat({ profileId, role: 'owner' }, chat.id);
    for (const id of scope) removed.add(id);
  }
}
