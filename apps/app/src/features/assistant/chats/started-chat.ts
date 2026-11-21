import type { Engine } from '@smarteverything/domain';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically, type Edit } from '../../../store/optimistic';
import { startedChat } from './chat-prediction';

export interface ChatStart {
  readonly store: EntityStore;
  readonly chatId: string;
  readonly engine: Engine;
  readonly create: () => Promise<unknown>;
}

function startEdits(start: ChatStart): readonly Edit[] {
  const { store, chatId, engine } = start;
  const state = store.get();
  const profileId = state.session?.client.profile_id ?? null;
  if (profileId === null || state.tables.ai_chats.byId[chatId] !== undefined) return [];
  const row = startedChat({ id: chatId, profileId, engine }, new Date());
  return [liveRowEdit('ai_chats', chatId, null, row)];
}

export function createStartedChat(start: ChatStart): Promise<unknown> {
  return writeOptimistically(start.store, {
    event: 'chat.create',
    edits: startEdits(start),
    send: start.create,
    fields: { chatId: start.chatId, engineKind: start.engine.kind },
  });
}
