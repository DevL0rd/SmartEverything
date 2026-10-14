import { assistantLabel, type AiChatRow } from '@smarteverything/domain';
import { toolGuide } from '../ai-tools/tool-guide';
import { chatCatalogue, toolIndex } from '../ai-tools/tool-sets';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Store } from '../store/store';
import type { PromptFacts } from './conversation/prompt';

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
    responseStyle: assistant.response_style,
    guide: toolGuide(tools === null ? [] : tools.list().map((tool) => tool.name)),
    toolIndex: tools === null ? '' : toolIndex(tools.list()),
    catalogue: tools === null ? '' : chatCatalogue(tools.list()),
    chat,
  };
}
