import type { Store } from '../store/store';
import type { AssistantService } from './service';

export async function removeProfileChats(
  store: Store,
  assistant: Pick<AssistantService, 'removeChat'>,
  profileId: string,
): Promise<void> {
  const chats = [false, true].flatMap((archived) => store.aiChats.chats({ profileId, archived }));
  const removed = new Set<string>();
  for (const chat of chats) {
    if (removed.has(chat.id)) continue;
    const scope = store.aiChats.removalIds(chat.id);
    await assistant.removeChat({ profileId, role: 'owner' }, chat.id);
    for (const id of scope) removed.add(id);
  }
}
