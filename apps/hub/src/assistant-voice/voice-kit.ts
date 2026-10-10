import { chatSearchesWeb } from '@smarteverything/domain';
import type { FunctionDeclaration } from '@google/genai';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { Store } from '../store/store';
import { liveInstructions, STAYS_OPEN_ENDING } from './instructions';
import type { HostedSpeaking } from './outreach';
import { personaOf, type Caller } from './persona';
import { hostedSet, voiceSet, withoutChatOnly } from './voice-tools';

export interface VoiceKit {
  readonly store: Store;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly now: () => Date;
}

export interface VoiceWho {
  readonly caller: Caller;
  readonly chatId: string;
  readonly place: string | null;
  readonly speaking: HostedSpeaking | null;
  readonly canSee: boolean;
  readonly staysOpen?: boolean;
}

export function systemOf(kit: VoiceKit, who: VoiceWho): string {
  const { store, responder, tools } = kit;
  return liveInstructions(
    personaOf({
      store,
      caller: who.caller,
      chatId: who.chatId,
      place: who.place,
      sight: who.canSee,
      ending: who.speaking?.ending ?? (who.staysOpen === true ? STAYS_OPEN_ENDING : null),
      unavailable: responder.ready(who.chatId),
      toolIndex: tools.index(withoutChatOnly(tools.list(), who.canSee)),
      catalogue: tools.catalogue(withoutChatOnly(tools.list(), who.canSee)),
      now: kit.now(),
    }),
  );
}

export function declarationsOf(kit: VoiceKit, who: VoiceWho): readonly FunctionDeclaration[] {
  const { tools, responder } = kit;
  return tools.geminiDeclarations(
    hostedSet(
      voiceSet(tools.list(), responder.ready(who.chatId) === null, who.canSee),
      who.speaking,
    ),
  );
}

export function callSearchesWeb(kit: VoiceKit, who: VoiceWho): boolean {
  return chatSearchesWeb(
    kit.store.aiChats.chat(who.chatId),
    kit.store.assistantChat.settings().web_search_default,
  );
}
