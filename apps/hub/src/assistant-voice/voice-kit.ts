import type { FunctionDeclaration } from '@google/genai';
import { toolGuide } from '../ai-tools/tool-guide';
import { DISCOVERY_NAMES } from '../ai-tools/tool-discovery';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { Store } from '../store/store';
import { liveInstructions, STAYS_OPEN_ENDING } from './instructions';
import type { HostedSpeaking } from './outreach';
import { personaOf, type Caller } from './persona';
import { hostedSet, voiceSet, withoutChatOnly, VOICE_TOOL_NAMES } from './voice-tools';

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

export function voiceHub(kit: VoiceKit, who: VoiceWho): ToolHub {
  const allowed = kit.store.aiChats.chat(who.chatId).tools;
  return kit.tools.restrict(
    (tool) =>
      (allowed === null || allowed.includes(tool.name) || DISCOVERY_NAMES.has(tool.name)) &&
      withoutChatOnly([tool], who.canSee).length > 0 &&
      hostedSet([tool], who.speaking).length > 0,
  );
}

function hidden(who: VoiceWho, name: string): boolean {
  return who.speaking?.hiddenTools.has(name) === true;
}

export function systemOf(kit: VoiceKit, who: VoiceWho): string {
  const { store, responder } = kit;
  const tools = voiceHub(kit, who);
  return liveInstructions({
    ...personaOf({
      store,
      caller: who.caller,
      chatId: who.chatId,
      place: who.place,
      sight: who.canSee && !hidden(who, VOICE_TOOL_NAMES.see),
      ending: hidden(who, VOICE_TOOL_NAMES.end)
        ? ''
        : (who.speaking?.ending ?? (who.staysOpen === true ? STAYS_OPEN_ENDING : null)),
      unavailable: hidden(who, VOICE_TOOL_NAMES.task)
        ? 'background tasks are hidden in this call'
        : responder.ready(who.chatId),
      toolIndex: tools.index(tools.list()),
      catalogue: tools.catalogue(tools.list()),
      now: kit.now(),
    }),
    stopLooking: !hidden(who, VOICE_TOOL_NAMES.stopLooking),
    guide: toolGuide(tools.list().map((tool) => tool.name)),
  });
}

export function declarationsOf(kit: VoiceKit, who: VoiceWho): readonly FunctionDeclaration[] {
  const { responder } = kit;
  const tools = voiceHub(kit, who);
  return tools.geminiDeclarations(
    hostedSet(
      voiceSet(tools.list(), responder.ready(who.chatId) === null, who.canSee),
      who.speaking,
    ),
  );
}
