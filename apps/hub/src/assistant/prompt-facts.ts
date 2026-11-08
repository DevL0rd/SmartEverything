import { assistantLabel, type AiChatRow } from '@smarteverything/domain';
import { hasOwnerDevice } from '../server/person-access';
import { toolGuide } from '../ai-tools/tool-guide';
import { chatCatalogue, toolIndex } from '../ai-tools/tool-sets';
import type { ToolHub } from '../ai-tools/tool-hub';
import { boardTypes } from '../chat-widgets/boards';
import type { Store } from '../store/store';
import type { PromptFacts, StableFacts } from './conversation/prompt';
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

export function stableFacts(store: Store, tools: ToolHub | null, helper = false): StableFacts {
  const assistant = store.assistantChat.settings();
  return {
    name: assistantLabel(assistant),
    aliases: assistant.aliases,
    homeName: store.settings.read().home_name,
    instructions: assistant.instructions,
    responseStyle: assistant.response_style,
    guide: toolGuide(tools === null ? [] : tools.list().map((tool) => tool.name), helper),
    toolIndex: tools === null ? '' : toolIndex(tools.list()),
    catalogue: tools === null ? '' : chatCatalogue(tools.list()),
  };
}

export function facts(
  store: Store,
  chat: AiChatRow,
  tools: ToolHub | null,
  turn: { readonly now: Date; readonly clientId: string | null },
): PromptFacts {
  const sender = senderNote(store, turn.clientId);
  const helper = chat.kind === 'subagent' && chat.parent_id !== null && chat.helper_name !== null;
  return {
    ...stableFacts(store, tools, helper),
    profileName: store.profiles.byId(chat.profile_id).name,
    role: roleOf(store, chat.profile_id),
    timeZone: store.settings.read().time_zone,
    now: turn.now,
    boardTypes: boardsOf(store, tools),
    interruption: interruptionNote(store, chat.id),
    ...(sender === null ? {} : { sender }),
    chat,
  };
}
