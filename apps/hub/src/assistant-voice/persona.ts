import {
  assistantLabel,
  type AssistantMessageRow,
  type ClientRow,
  type PluginRequester,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { chatContext, transcriptLine } from '../assistant/conversation/history';
import { attachmentNote } from '@smarteverything/domain';
import { machineLabel, machineOfClient, ownScreenRule, type Machine } from '../assistant/machine';
import type { Persona, VoiceNote } from './instructions';
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

export function callerOf(store: Store, client: ClientRow, device: string): Caller {
  const profile = store.profiles.activeOf(client.id);
  return {
    clientId: client.id,
    role: client.role === 'owner' ? 'owner' : 'member',
    profileId: profile.id,
    person: profile.name,
    device,
    machine: machineOfClient(store, client),
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

export function hostedCallerOf(store: Store, hosted: HostedCaller): Caller {
  return {
    clientId: null,
    role: hosted.role,
    profileId: hosted.profileId,
    person: store.profiles.byId(hosted.profileId).name,
    device: hosted.label,
    machine: hosted.machine ?? null,
    ...(hosted.requester === undefined ? {} : { requester: hosted.requester }),
    ...(hosted.pluginId === undefined ? {} : { pluginId: hosted.pluginId }),
  };
}

export function assistantNames(store: Store): string[] {
  const settings = store.assistantChat.settings();
  return [assistantLabel(settings), ...settings.aliases];
}

const OMITTED =
  'Earlier messages of this chat are not shown here; read them with read_chats view messages when they matter.';

function linesOf(store: Store, row: AssistantMessageRow): string[] {
  if (row.kind === 'call') {
    return row.text.split('\n').filter((line) => line !== '');
  }
  const files = row.attachments.map((file) =>
    attachmentNote(file, store.assistantChat.attachment(file.id).transcript, { pending: false }),
  );
  const text = [row.text, ...files].filter((part) => part !== '').join(' ');
  return text === '' ? [] : [transcriptLine({ ...row, text })];
}

export function historyOf(store: Store, chatId: string): string[] {
  const budget = historyCharacters(store.assistantChat.settings());
  const { summary, rows } = chatContext(store, chatId);
  const lines = rows.flatMap((row) => linesOf(store, row));
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
  readonly unavailable: string | null;
  readonly toolIndex: string;
  readonly catalogue: string;
  readonly place: string | null;
  readonly sight: boolean;
  readonly ending: string | null;
}

export function personaOf(input: PersonaInput): Persona {
  const { store } = input;
  const assistant = store.assistantChat.settings();
  return {
    names: assistantNames(store),
    style: assistant.response_style,
    instructions: assistant.instructions,
    home: store.settings.read().home_name,
    place: input.place,
    unavailable: input.unavailable,
    toolIndex: input.toolIndex,
    catalogue: input.catalogue,
    sight: input.sight,
    ...(input.ending === null ? {} : { ending: input.ending }),
  };
}

export interface NoteInput {
  readonly store: Store;
  readonly caller: Caller;
  readonly chatId: string;
  readonly place: string | null;
  readonly recentSpeech: string | null;
  readonly known: ReadonlySet<string> | null;
  readonly starting: boolean;
  readonly now: Date;
}

export function noteOf(input: NoteInput): VoiceNote {
  const { store, caller, known } = input;
  const history = historyOf(store, input.chatId);
  return {
    person: caller.person,
    role: caller.role,
    device: caller.machine === null ? caller.device : machineLabel(caller.machine),
    screenRule: caller.machine === null ? null : ownScreenRule(caller.machine),
    timeZone: store.settings.read().time_zone,
    now: input.now,
    place: input.place,
    recentSpeech: input.recentSpeech,
    history: known === null ? history : history.filter((line) => !known.has(line)),
    since: known === null ? 'start' : 'last_talk',
    starting: input.starting,
  };
}
