import { MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import type { FunctionDeclaration } from '@google/genai';
import { toolGuide } from '../ai-tools/tool-guide';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { Store } from '../store/store';
import { conversationNote, liveInstructions, STAYS_OPEN_ENDING } from './instructions';
import type { HostedSpeaking } from './outreach';
import { noteOf, personaOf, type Caller } from './persona';
import { voiceToolIndex } from './voice-deferred';
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
  return kit.tools.restrict((tool) => {
    const now = who();
    return (
      (allowed === null || allowed.includes(tool.name) || MCP_DISCOVERY_TOOLS.has(tool.name)) &&
      withoutChatOnly([tool], now.canSee).length > 0 &&
      hostedSet([tool], now.speaking).length > 0
    );
  });
}

export function callSearchesWeb(hub: ToolHub): boolean {
  return hub.list().some((tool) => tool.name === WEB_SEARCH_TOOL);
}

function hidden(who: VoiceWho, name: string): boolean {
  return who.speaking?.hiddenTools.has(name) === true;
}

export function systemOf(kit: VoiceKit, tools: ToolHub, who: VoiceWho): string {
  const { store, responder } = kit;
  return liveInstructions({
    ...personaOf({
      store,
      place: who.place,
      sight: who.canSee && !hidden(who, VOICE_TOOL_NAMES.see),
      ending: hidden(who, VOICE_TOOL_NAMES.end)
        ? ''
        : (who.speaking?.ending ?? (who.staysOpen === true ? STAYS_OPEN_ENDING : null)),
      unavailable: hidden(who, VOICE_TOOL_NAMES.task)
        ? 'background tasks are hidden in this call'
        : responder.ready(who.chatId),
      toolIndex: voiceToolIndex(tools.list()),
      catalogue: tools.catalogue(tools.list()),
    }),
    stopLooking: !hidden(who, VOICE_TOOL_NAMES.stopLooking),
    guide: toolGuide(tools.list().map((tool) => tool.name)),
  });
}

export function voiceNoteOf(kit: VoiceKit, who: VoiceWho, request: NoteRequest): string {
  return conversationNote(
    noteOf({
      store: kit.store,
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
    : `${systemOf(kit, tools, who)}\n\n${voiceNoteOf(kit, who, ONE_TURN_NOTE)}`;
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
