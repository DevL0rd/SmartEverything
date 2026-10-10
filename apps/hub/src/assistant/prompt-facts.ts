import { assistantLabel, type AiChatRow } from '@smarteverything/domain';
import { chatCatalogue } from '../ai-tools/tool-sets';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Store } from '../store/store';
import type { PromptFacts } from './engines/openrouter/context';

function roleOf(store: Store, profileId: string): PromptFacts['role'] {
  const clients = store.clients.list().filter((client) => client.profile_id === profileId);
  return clients.some((client) => client.role === 'owner') ? 'owner' : 'member';
}

export function facts(
  store: Store,
  chat: AiChatRow,
  tools: ToolHub | null,
  now: Date,
): PromptFacts {
  const settings = store.settings.read();
  const assistant = store.assistantChat.settings();
  return {
    name: assistantLabel(assistant),
    profileName: store.profiles.byId(chat.profile_id).name,
    role: roleOf(store, chat.profile_id),
    homeName: settings.home_name,
    timeZone: settings.time_zone,
    now,
    instructions: assistant.instructions,
    catalogue: tools === null ? '' : chatCatalogue(tools.list()),
    chat,
  };
}
