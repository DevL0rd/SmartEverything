import { assistantLabel, type AiChatRow } from '@smarteverything/domain';
import { hasOwnerDevice } from '../server/person-access';
import { toolGuide } from '../ai-tools/tool-guide';
import { chatCatalogue, toolIndex } from '../ai-tools/tool-sets';
import type { ToolHub } from '../ai-tools/tool-hub';
import { boardTypes } from '../chat-widgets/boards';
import type { Store } from '../store/store';
import type { PromptFacts } from './conversation/prompt';
import { interruptionNote } from './interruption';
import { senderNote } from './sender-note';

function boardsOf(store: Store, tools: ToolHub | null): readonly string[] {
  return tools?.list().some((tool) => tool.name === 'widget_show') === true
    ? boardTypes(store)
    : [];
}

function roleOf(store: Store, profileId: string): PromptFacts['role'] {
  return hasOwnerDevice(store, profileId) ? 'owner' : 'member';
}

export function facts(
  store: Store,
  chat: AiChatRow,
  tools: ToolHub | null,
  turn: { readonly now: Date; readonly clientId: string | null },
): PromptFacts {
  const settings = store.settings.read();
  const assistant = store.assistantChat.settings();
  const sender = senderNote(store, turn.clientId);
  return {
    name: assistantLabel(assistant),
    profileName: store.profiles.byId(chat.profile_id).name,
    role: roleOf(store, chat.profile_id),
    homeName: settings.home_name,
    timeZone: settings.time_zone,
    now: turn.now,
    boardTypes: boardsOf(store, tools),
    interruption: interruptionNote(store, chat.id),
    ...(sender === null ? {} : { sender }),
    instructions: assistant.instructions,
    responseStyle: assistant.response_style,
    guide: toolGuide(tools === null ? [] : tools.list().map((tool) => tool.name)),
    toolIndex: tools === null ? '' : toolIndex(tools.list()),
    catalogue: tools === null ? '' : chatCatalogue(tools.list()),
    chat,
  };
}
