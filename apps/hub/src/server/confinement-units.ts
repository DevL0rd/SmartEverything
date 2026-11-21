import { reachesChat } from '../assistant/chat-ownership';
import { storeUnit } from '../store/host/unit';

export interface ConfinedChats {
  readonly confinedTo: string | null;
  readonly chatIds: readonly string[];
}

export const CONFINED_CHATS_UNIT = storeUnit(
  (store, { confinedTo, chatIds }: ConfinedChats): boolean =>
    chatIds.every((id) => reachesChat(store, confinedTo, store.aiChats.chat(id))),
);
