import { MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import type { FunctionDeclaration } from '@google/genai';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { Store } from '../store/store';
import { conversationNote, liveInstructions, STAYS_OPEN_ENDING } from './instructions';
import type { HostedSpeaking } from './outreach';
import { noteOf, personaOf, type Caller } from './persona';
import { callPrincipal, type VoiceMemory } from './voice-memory';
import type { MemoryPrincipal } from '../memory/principal';
import {
  hostedSet,
  voiceSet,
  withoutChatOnly,
  VOICE_TOOL_NAMES,
  WEB_SEARCH_TOOL,
} from './voice-tools';

export interface VoiceKit {
  readonly store: Store;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly memory: VoiceMemory;
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

export interface NoteRequest {
  readonly recentSpeech: string | null;
  readonly known: ReadonlySet<string> | null;
  readonly starting: boolean;
}

export function voiceHub(kit: VoiceKit, who: () => VoiceWho): ToolHub {
  const allowed = kit.store.aiChats.chat(who().chatId).tools;
  const hub = kit.tools.restrict((tool) => {
    const now = who();
    return (
      (allowed === null || allowed.includes(tool.name) || MCP_DISCOVERY_TOOLS.has(tool.name)) &&
      withoutChatOnly([tool], now.canSee).length > 0 &&
      hostedSet([tool], now.speaking).length > 0
    );
  });
  hub.add(kit.memory.source(() => principalOf(who())));
  return hub;
}

function principalOf(who: VoiceWho): MemoryPrincipal {
  return callPrincipal({ ...who.caller, chatId: who.chatId });
}

export function callSearchesWeb(kit: VoiceKit, who: VoiceWho): boolean {
  const allowed = kit.store.aiChats.chat(who.chatId).tools;
  return allowed === null || allowed.includes(WEB_SEARCH_TOOL);
}

function hidden(who: VoiceWho, name: string): boolean {
  return who.speaking?.hiddenTools.has(name) === true;
}

export function systemOf(kit: VoiceKit, tools: ToolHub, who: VoiceWho): string {
  const { store, responder } = kit;
  return liveInstructions(
    personaOf({
      store,
      tools,
      place: who.place,
      sight: who.canSee && !hidden(who, VOICE_TOOL_NAMES.see),
      ending: hidden(who, VOICE_TOOL_NAMES.end)
        ? ''
        : (who.speaking?.ending ?? (who.staysOpen === true ? STAYS_OPEN_ENDING : null)),
      unavailable: hidden(who, VOICE_TOOL_NAMES.task)
        ? 'background tasks are hidden in this call'
        : responder.ready(who.chatId),
      stopLooking: !hidden(who, VOICE_TOOL_NAMES.stopLooking),
    }),
  );
}

export function voiceNoteOf(
  kit: VoiceKit,
  tools: ToolHub,
  who: VoiceWho,
  request: NoteRequest,
): string {
  return conversationNote(
    noteOf({
      store: kit.store,
      tools,
      memory: kit.memory,
      caller: who.caller,
      chatId: who.chatId,
      place: who.place,
      now: kit.now(),
      ...request,
    }),
  );
}

const ONE_TURN_NOTE: NoteRequest = { recentSpeech: null, known: null, starting: false };

export function turnSystemOf(kit: VoiceKit, tools: ToolHub, who: VoiceWho, bare: boolean): string {
  return bare
    ? (who.place ?? '')
    : `${systemOf(kit, tools, who)}\n\n${voiceNoteOf(kit, tools, who, ONE_TURN_NOTE)}`;
}

export function declarationsOf(
  kit: VoiceKit,
  tools: ToolHub,
  who: VoiceWho,
): readonly FunctionDeclaration[] {
  const { responder } = kit;
  return tools.geminiDeclarations(
    hostedSet(
      voiceSet(tools.list(), responder.ready(who.chatId) === null, who.canSee),
      who.speaking,
    ),
  );
}
