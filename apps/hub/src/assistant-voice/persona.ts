import {
  assistantLabel,
  type AssistantMessageRow,
  type ClientRow,
  type PluginRequester,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { chatContext, transcriptLine } from '../assistant/conversation/history';
import { attachmentNote } from '../assistant/attachment-note';
import type { Persona } from './instructions';
import { historyCharacters, newest } from './live-window';

export interface Caller {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
  readonly person: string;
  readonly device: string;
  readonly requester?: PluginRequester;
  readonly pluginId?: string;
}

export function callerOf(store: Store, client: ClientRow, device: string): Caller {
  const profile =
    client.profile_id === null ? store.profiles.first() : store.profiles.byId(client.profile_id);
  return {
    clientId: client.id,
    role: client.role === 'owner' ? 'owner' : 'member',
    profileId: profile.id,
    person: profile.name,
    device,
  };
}

export interface HostedCaller {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
  readonly label: string;
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
    ...(hosted.requester === undefined ? {} : { requester: hosted.requester }),
    ...(hosted.pluginId === undefined ? {} : { pluginId: hosted.pluginId }),
  };
}

export function assistantNames(store: Store): string[] {
  const settings = store.assistantChat.settings();
  return [assistantLabel(settings), ...settings.aliases];
}

const OMITTED =
  'Earlier messages of this chat are not shown here; read them with chat_read when they matter.';

function linesOf(store: Store, row: AssistantMessageRow): string[] {
  if (row.kind === 'call') {
    return row.text.split('\n').filter((line) => line !== '');
  }
  const files = row.attachments.map((file) =>
    attachmentNote(file, store.assistantChat.attachment(file.id).transcript),
  );
  const text = [row.text, ...files].filter((part) => part !== '').join(' ');
  return text === '' ? [] : [transcriptLine({ ...row, text })];
}

function historyOf(store: Store, chatId: string): string[] {
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
  readonly caller: Caller;
  readonly chatId: string;
  readonly unavailable: string | null;
  readonly toolIndex: string;
  readonly catalogue: string;
  readonly place: string | null;
  readonly sight: boolean;
  readonly ending: string | null;
  readonly now: Date;
}

export function personaOf(input: PersonaInput): Persona {
  const { store, caller, now } = input;
  const home = store.settings.read();
  return {
    names: assistantNames(store),
    device: caller.device,
    person: caller.person,
    role: caller.role,
    home: home.home_name,
    timeZone: home.time_zone,
    now,
    place: input.place,
    unavailable: input.unavailable,
    toolIndex: input.toolIndex,
    catalogue: input.catalogue,
    history: historyOf(store, input.chatId),
    sight: input.sight,
    ...(input.ending === null ? {} : { ending: input.ending }),
  };
}
