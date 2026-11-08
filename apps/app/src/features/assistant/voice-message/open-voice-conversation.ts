import { router } from 'expo-router';
import { openConversationChat } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import {
  assertAssistantWriteCurrent,
  captureAssistantWrite,
} from '../../../store/assistant-response-style';
import type { EntityStore } from '../../../store/entity-store';
import { upsert } from '../../../store/table-ops';
import { RULES } from '../../../store/table-rules';
import { requestVoiceMessage } from './voice-request';

export async function recordInConversation(
  store: EntityStore,
  current: () => boolean,
): Promise<void> {
  const authority = captureAssistantWrite(store);
  const chat = await openConversationChat();
  if (!current()) return;
  assertAssistantWriteCurrent(authority);
  store.update((state) => {
    if (state.tables.ai_chats.byId[chat.id] !== undefined) return state;
    return {
      ...state,
      tables: {
        ...state.tables,
        ai_chats: upsert(state.tables.ai_chats, chat, RULES.ai_chats),
      },
    };
  });
  requestVoiceMessage(chat.id);
  router.replace(href.assistantChat(chat.id));
}
