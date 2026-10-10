import { assistantLabel, type ClientRow } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { chatContext, transcriptLine } from '../assistant/engines/openrouter/compaction';
import type { Persona } from './instructions';

export interface Caller {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
  readonly person: string;
  readonly device: string;
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
}

export function hostedCallerOf(store: Store, hosted: HostedCaller): Caller {
  return {
    clientId: null,
    role: hosted.role,
    profileId: hosted.profileId,
    person: store.profiles.byId(hosted.profileId).name,
    device: hosted.label,
  };
}

export function assistantNames(store: Store): string[] {
  const settings = store.assistantChat.settings();
  return [assistantLabel(settings), ...settings.aliases];
}

function historyOf(store: Store, chatId: string): string[] {
  const { summary, rows } = chatContext(store, chatId);
  return [
    ...(summary === null ? [] : [`Summary of the earlier part: ${summary}`]),
    ...rows
      .filter((row) => row.text !== '')
      .flatMap((row) => (row.kind === 'call' ? row.text.split('\n') : [transcriptLine(row)])),
  ];
}

export interface PersonaInput {
  readonly store: Store;
  readonly caller: Caller;
  readonly chatId: string;
  readonly unavailable: string | null;
  readonly catalogue: string;
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
    unavailable: input.unavailable,
    catalogue: input.catalogue,
    history: historyOf(store, input.chatId),
  };
}
