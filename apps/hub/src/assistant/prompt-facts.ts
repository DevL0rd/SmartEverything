import { assistantLabel, type AiChatRow, type PluginRow } from '@smarteverything/domain';
import { hasOwnerDevice } from '../server/person-access-units';
import { toolGuide } from '../ai-tools/tool-guide';
import { chatCatalogue, toolIndex } from '../ai-tools/tool-sets';
import type { ToolHub } from '../ai-tools/tool-hub';
import { boardTypes } from '../chat-widgets/boards';
import type { Store } from '../store/store';
import type { HostStore } from '../store/host/host-store';
import { storeUnit } from '../store/host/unit';
import type { PromptFacts, StableFacts } from './conversation/prompt';
import { interruptionNote } from './interruption';
import { senderNote } from './sender-note';
import { personHour24 } from '../clock/person-clock-units';

export interface TurnFacts {
  readonly profileName: string;
  readonly role: PromptFacts['role'];
  readonly hour24: boolean;
  readonly interruption: string | null;
  readonly sender: string | null;
}

export interface TurnFactsInput {
  readonly profileId: string;
  readonly chatId: string;
  readonly clientId: string | null;
}

export function turnFactsOf(store: HostStore, input: TurnFactsInput): TurnFacts {
  return {
    profileName: store.profiles.byId(input.profileId).name,
    role: hasOwnerDevice(store, input.profileId) ? 'owner' : 'member',
    hour24: personHour24(store, input.profileId),
    interruption: interruptionNote(store, input.chatId),
    sender: senderNote(store, input.clientId),
  };
}

export const TURN_FACTS_UNIT = storeUnit((store, input: TurnFactsInput): TurnFacts =>
  turnFactsOf(store, input),
);

function boardsOf(plugins: readonly PluginRow[], tools: ToolHub | null): readonly string[] {
  return tools?.list().some((tool) => tool.name === 'widget_show') === true
    ? boardTypes(plugins)
    : [];
}

export function stableFacts(
  store: Pick<Store, 'live'>,
  tools: ToolHub | null,
  helper = false,
): StableFacts {
  const assistant = store.live.home.assistant.read();
  return {
    name: assistantLabel(assistant),
    aliases: assistant.aliases,
    homeName: store.live.home.settings.read().home_name,
    instructions: assistant.instructions,
    responseStyle: assistant.response_style,
    guide: toolGuide(tools === null ? [] : tools.list().map((tool) => tool.name), helper),
    toolIndex: tools === null ? '' : toolIndex(tools.list()),
    catalogue: tools === null ? '' : chatCatalogue(tools.list()),
  };
}

export function factsFrom(
  store: Pick<Store, 'live'>,
  chat: AiChatRow,
  tools: ToolHub | null,
  turn: { readonly now: Date; readonly facts: TurnFacts },
): PromptFacts {
  const { sender, ...facts } = turn.facts;
  const helper = chat.kind === 'subagent' && chat.parent_id !== null && chat.helper_name !== null;
  return {
    ...stableFacts(store, tools, helper),
    ...facts,
    timeZone: store.live.home.settings.read().time_zone,
    now: turn.now,
    boardTypes: boardsOf(store.live.home.plugins.list(), tools),
    ...(sender === null ? {} : { sender }),
    chat,
  };
}

export async function facts(
  store: Pick<Store, 'live' | 'host'>,
  chat: AiChatRow,
  tools: ToolHub | null,
  turn: { readonly now: Date; readonly clientId: string | null },
): Promise<PromptFacts> {
  const stored = await store.host.read('assistantTurnFacts', {
    profileId: chat.profile_id,
    chatId: chat.id,
    clientId: turn.clientId,
  });
  return factsFrom(store, chat, tools, { now: turn.now, facts: stored });
}
