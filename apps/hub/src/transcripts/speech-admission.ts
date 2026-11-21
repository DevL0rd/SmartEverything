import { ApiError, type SpeechTrigger, type TranscriptSource } from '@smarteverything/domain';
import { ownedChat } from '../assistant/chat-ownership';
import { executionRole, admitExecutionTool } from '../assistant/turn-authority';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { roleOfCaller, type Caller } from '../server/auth';
import { effectiveClientById } from '../server/person-access-units';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { admitTranscriptCaller, admitTranscriptSource } from './reader-scope';
import { logSpeechReadFailure } from './speech-failures';
import { toolCallerOf, type SpeechPrincipal } from './speech-principal';

export function speechCaller(
  store: HostStore,
  principal: SpeechPrincipal,
): Extract<Caller, { kind: 'client' }> {
  const client = effectiveClientById(store, principal.clientId);
  store.profiles.byId(principal.profileId);
  const caller = principalCaller(client, principal);
  if (
    client.role !== principal.clientRole ||
    (principal.role === 'owner' &&
      (roleOfCaller(caller) !== 'owner' ||
        principal.authorities.some((authority) => executionRole(authority) !== 'owner')))
  )
    throw new ApiError('forbidden', 'The speech trigger initiating role changed.');
  if (caller.pluginId !== undefined && !store.plugins.byId(caller.pluginId).enabled)
    throw new ApiError('forbidden', 'The initiating plugin is disabled.');
  return caller;
}

export function speechToolCaller(store: HostStore, principal: SpeechPrincipal): ToolCaller {
  return toolCallerOf(principal, speechCaller(store, principal));
}

function principalCaller(
  client: Extract<Caller, { kind: 'client' }>['client'],
  principal: SpeechPrincipal,
): Extract<Caller, { kind: 'client' }> {
  return {
    kind: 'client',
    client,
    profileId: principal.profileId,
    ...(principal.via === undefined ? {} : { via: principal.via }),
    ...(principal.mcpOrigin === undefined ? {} : { mcpOrigin: principal.mcpOrigin }),
    ...(principal.pluginId === undefined ? {} : { pluginId: principal.pluginId }),
    ...(principal.pluginRequester === undefined
      ? {}
      : { pluginRequester: principal.pluginRequester }),
    ...(principal.chatId === undefined ? {} : { chatId: principal.chatId }),
    ...(principal.authority === undefined ? {} : { authority: principal.authority }),
  };
}

export function admitSpeechReadTool(
  store: HostStore,
  principal: SpeechPrincipal,
  tool: { readonly name: string },
): void {
  const authorities = [
    ...principal.authorities,
    ...(principal.authority === undefined ? [] : [principal.authority]),
  ];
  for (const authority of authorities) admitExecutionTool(store, tool.name, authority);
}

export function admitDeviceSpeech(
  store: HostStore,
  principal: SpeechPrincipal,
  device?: { readonly kind: TranscriptSource; readonly deviceId: string },
): void {
  admitSpeechReadTool(store, principal, { name: 'transcript_read' });
  const caller = speechCaller(store, principal);
  admitTranscriptCaller(caller);
  if (device !== undefined) admitTranscriptSource(store, caller, device.kind, device.deviceId);
}

function ownSpeechChat(store: HostStore, principal: SpeechPrincipal, chatId: string): void {
  ownedChat(store, { profileId: principal.profileId, role: principal.role }, chatId);
  admitSpeechReadTool(store, principal, { name: 'chat_read' });
}

function readerAdmitted(
  store: HostStore,
  principal: SpeechPrincipal,
  reader: SpeechReaderTool,
): boolean {
  try {
    if (!store.plugins.byId(reader.pluginId).enabled)
      throw new ApiError('forbidden', 'This speech source plugin is unavailable.');
    admitSpeechReadTool(store, principal, { name: reader.tool });
    return true;
  } catch (cause) {
    logSpeechReadFailure(cause);
    return false;
  }
}

export interface SpeechReaderTool {
  readonly pluginId: string;
  readonly tool: string;
}

export interface SpeechAdmissionAsk {
  readonly principal: SpeechPrincipal;
  readonly readers: readonly SpeechReaderTool[];
  readonly triggers: readonly SpeechTrigger[];
}

export interface SpeechAdmission {
  readonly caller: ToolCaller;
  readonly readers: readonly string[];
}

export const SPEECH_ADMISSION_UNIT = storeUnit(
  (store, ask: SpeechAdmissionAsk): SpeechAdmission => {
    const caller = speechToolCaller(store, ask.principal);
    const readers = ask.readers
      .filter((reader) => readerAdmitted(store, ask.principal, reader))
      .map((reader) => reader.pluginId);
    for (const trigger of ask.triggers) {
      const source = trigger.source;
      if (source?.kind === 'plugin') {
        if (!readers.includes(source.pluginId))
          throw new ApiError('forbidden', 'The selected plugin speech reader is not authorized.');
      } else if (source !== null && 'deviceId' in source)
        admitDeviceSpeech(store, { ...ask.principal, plugins: readers }, source);
      else if (source?.kind === 'attachment') ownSpeechChat(store, ask.principal, source.chatId);
    }
    return { caller, readers };
  },
);

export interface SpeechCatalogue {
  readonly caller: ToolCaller;
  readonly readers: readonly string[];
  readonly devices: boolean;
  readonly chats: readonly { readonly id: string; readonly title: string }[];
}

function admitted(work: () => void): boolean {
  try {
    work();
    return true;
  } catch (cause) {
    logSpeechReadFailure(cause);
    return false;
  }
}

export const SPEECH_CATALOGUE_UNIT = storeUnit(
  (
    store,
    ask: { readonly principal: SpeechPrincipal; readonly readers: readonly SpeechReaderTool[] },
  ): SpeechCatalogue => {
    const { principal } = ask;
    const chatRead = admitted(() => {
      admitSpeechReadTool(store, principal, { name: 'chat_read' });
    });
    return {
      caller: speechToolCaller(store, principal),
      readers: ask.readers
        .filter((reader) => readerAdmitted(store, principal, reader))
        .map((reader) => reader.pluginId),
      devices: admitted(() => {
        admitDeviceSpeech(store, principal);
      }),
      chats: chatRead
        ? store.aiChats
            .chats({ profileId: principal.profileId, archived: false })
            .map((chat) => ({ id: chat.id, title: chat.title }))
        : [],
    };
  },
);

export const SPEECH_CALLER_UNIT = storeUnit((store, principal: SpeechPrincipal): null => {
  speechCaller(store, principal);
  return null;
});
