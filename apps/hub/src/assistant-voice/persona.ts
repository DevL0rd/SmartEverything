import {
  assistantLabel,
  type AssistantMessageRow,
  type ClientRow,
  type PluginRequester,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { chatContext, transcriptLine } from '../assistant/conversation/history';
import { attachmentNote } from '@smarteverything/domain';
import { machineLabel, machineOf, ownScreenRule, type Machine } from '../assistant/machine';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { PromptFacts } from '../assistant/conversation/prompt';
import { facts, stableFacts } from '../assistant/prompt-facts';
import type { Persona, VoiceNote } from './instructions';
import { voiceToolIndex } from './voice-deferred';
import { callPrincipal, type VoiceMemory } from './voice-memory';
import { historyCharacters, newest } from './live-window';

export interface Caller {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
  readonly person: string;
  readonly device: string;
  readonly machine: Machine | null;
  readonly requester?: PluginRequester;
  readonly pluginId?: string;
}

export async function callerOf(store: Store, client: ClientRow, device: string): Promise<Caller> {
  const profile = await store.host.call('profiles', 'activeOf', client.id);
  return {
    clientId: client.id,
    role: client.role === 'owner' ? 'owner' : 'member',
    profileId: profile.id,
    person: profile.name,
    device,
    machine: await machineOf(store, client),
  };
}

export interface HostedCaller {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
  readonly label: string;
  readonly machine?: Machine;
  readonly requester?: PluginRequester;
  readonly pluginId?: string;
}

export async function hostedCallerOf(store: Store, hosted: HostedCaller): Promise<Caller> {
  const profile = await store.host.call('profiles', 'byId', hosted.profileId);
  return {
    clientId: null,
    role: hosted.role,
    profileId: hosted.profileId,
    person: profile.name,
    device: hosted.label,
    machine: hosted.machine ?? null,
    ...(hosted.requester === undefined ? {} : { requester: hosted.requester }),
    ...(hosted.pluginId === undefined ? {} : { pluginId: hosted.pluginId }),
  };
}

export function assistantNames(store: Store): string[] {
  const settings = store.live.home.assistant.read();
  return [assistantLabel(settings), ...settings.aliases];
}

const OMITTED =
  'Earlier messages of this chat are not shown here; read them with chat_read view messages when they matter.';

async function linesOf(store: Store, row: AssistantMessageRow): Promise<string[]> {
  if (row.kind === 'call') {
    return row.text.split('\n').filter((line) => line !== '');
  }
  const files = await Promise.all(
    row.attachments.map(async (file) =>
      attachmentNote(
        file,
        (await store.host.call('assistantChat', 'attachment', file.id)).transcript,
        { pending: false },
      ),
    ),
  );
  const text = [row.text, ...files].filter((part) => part !== '').join(' ');
  return text === '' ? [] : [transcriptLine({ ...row, text })];
}

export async function historyOf(store: Store, chatId: string): Promise<string[]> {
  const budget = historyCharacters(store.live.home.assistant.read());
  const { summary, rows } = await chatContext(store, chatId);
  const lines = (await Promise.all(rows.map((row) => linesOf(store, row)))).flat();
  const kept = newest(lines, budget);
  const summaryLine =
    summary === null ? [] : [`Summary of the earlier part: ${summary.slice(0, budget / 2)}`];
  return [
    ...(kept.length < lines.length || summary !== null ? [OMITTED] : []),
    ...summaryLine,
    ...kept,
  ];
}

export interface PersonaInput {
  readonly store: Store;
  readonly tools: ToolHub;
  readonly unavailable: string | null;
  readonly place: string | null;
  readonly sight: boolean;
  readonly stopLooking: boolean;
  readonly ending: string | null;
}

export function personaOf(input: PersonaInput): Persona {
  return {
    facts: {
      ...stableFacts(input.store, input.tools),
      toolIndex: voiceToolIndex(input.tools.list()),
    },
    place: input.place,
    unavailable: input.unavailable,
    sight: input.sight,
    stopLooking: input.stopLooking,
    ...(input.ending === null ? {} : { ending: input.ending }),
  };
}

export interface NoteInput {
  readonly store: Store;
  readonly tools: ToolHub;
  readonly memory: VoiceMemory;
  readonly caller: Caller;
  readonly chatId: string;
  readonly place: string | null;
  readonly recentSpeech: string | null;
  readonly known: ReadonlySet<string> | null;
  readonly starting: boolean;
  readonly now: Date;
}

async function contextOf(input: NoteInput): Promise<PromptFacts> {
  const { store, caller } = input;
  const chat = await store.host.call('aiChats', 'chat', input.chatId);
  return {
    ...(await facts(store, chat, input.tools, {
      now: input.now,
      clientId: null,
    })),
    role: caller.role,
    sender: caller.machine === null ? caller.device : machineLabel(caller.machine),
    interruption: null,
  };
}

export async function noteOf(input: NoteInput): Promise<VoiceNote> {
  const { store, caller, known } = input;
  const history = await historyOf(store, input.chatId);
  return {
    context: await contextOf(input),
    screenRule: caller.machine === null ? null : ownScreenRule(caller.machine),
    place: input.place,
    recentSpeech: input.recentSpeech,
    memories: await input.memory.recall(callPrincipal({ ...caller, chatId: input.chatId })),
    history: known === null ? history : history.filter((line) => !known.has(line)),
    since: known === null ? 'start' : 'last_talk',
    starting: input.starting,
  };
}
