import { logSpeechReadFailure } from './speech-failures';
import {
  ApiError,
  type SpeechSource,
  type SpeechTrigger,
  type TranscriptSession,
  type TranscriptSource,
} from '@smarteverything/domain';
import type { PluginSpeechReader } from '../store/repositories/speech';
import { ownedChat } from '../assistant/chat-directory';
import { admitExecutionTool } from '../assistant/turn-authority';
import type { Store } from '../store/store';
import { admitTranscriptCaller, admitTranscriptSource } from './reader-scope';
import { speechCaller, speechToolCaller, type SpeechPrincipal } from './speech-principal';
import type { CommittedSpeech } from './speech';

export function admitSpeechReadTool(
  store: Store,
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
  store: Store,
  principal: SpeechPrincipal,
  device?: { readonly kind: TranscriptSource; readonly deviceId: string },
): void {
  admitSpeechReadTool(store, principal, { name: 'read_transcripts' });
  const caller = speechCaller(store, principal);
  admitTranscriptCaller(caller);
  if (device !== undefined) admitTranscriptSource(store, caller, device.kind, device.deviceId);
}

export function pluginReader(store: Store, pluginId: string): PluginSpeechReader {
  const plugin = store.plugins.byId(pluginId);
  const reader = store.speech.plugin(pluginId);
  if (!plugin.enabled || reader === undefined)
    throw new ApiError('forbidden', 'This speech source plugin is unavailable.');
  return reader;
}

export function admitSpeechSources(
  store: Store,
  principal: SpeechPrincipal,
  triggers: readonly SpeechTrigger[],
): SpeechPrincipal {
  const caller = speechToolCaller(store, principal);
  const admitted = store.speech.plugins().flatMap(([id, reader]) => {
    try {
      pluginReader(store, id);
      admitSpeechReadTool(store, principal, reader.readTool());
      reader.admit(caller);
      return [id];
    } catch (cause) {
      logSpeechReadFailure(cause);
      return [];
    }
  });
  const bound = { ...principal, plugins: admitted };
  for (const trigger of triggers) {
    const source = trigger.source;
    if (source?.kind === 'plugin') {
      if (!admitted.includes(source.pluginId))
        throw new ApiError('forbidden', 'The selected plugin speech reader is not authorized.');
      pluginReader(store, source.pluginId).admit(caller, source.sourceId);
    } else if (source !== null && 'deviceId' in source) admitDeviceSpeech(store, bound, source);
    else if (source?.kind === 'attachment') ownSpeechChat(store, bound, source.chatId);
  }
  return bound;
}

function ownSpeechChat(store: Store, principal: SpeechPrincipal, chatId: string): void {
  ownedChat(store, { profileId: principal.profileId, role: principal.role }, chatId);
  admitSpeechReadTool(store, principal, { name: 'read_chats' });
}

export function validateSpeechSource(
  store: Store,
  principal: SpeechPrincipal,
  source: SpeechSource | null,
  speech?: CommittedSpeech,
): void {
  speechCaller(store, principal);
  if (speech?.kind === 'transcript') {
    validateTranscript(store, principal, source, speech.session);
    return;
  }
  if (speech?.kind === 'attachment') {
    validateAttachment(store, principal, source, speech);
    return;
  }
  validateSelectedSource(store, principal, source);
}

function validateSelectedSource(
  store: Store,
  principal: SpeechPrincipal,
  source: SpeechSource | null,
): void {
  if (source !== null && 'deviceId' in source) admitDeviceSpeech(store, principal, source);
  else if (source?.kind === 'attachment') ownSpeechChat(store, principal, source.chatId);
  else if (source?.kind === 'plugin') {
    if (!principal.plugins.includes(source.pluginId))
      throw new ApiError('forbidden', 'The speech plugin was not admitted.');
    const reader = pluginReader(store, source.pluginId);
    admitSpeechReadTool(store, principal, reader.readTool());
    reader.validate(speechToolCaller(store, principal), undefined, source.sourceId);
  }
}

function validateTranscript(
  store: Store,
  principal: SpeechPrincipal,
  source: SpeechSource | null,
  session: TranscriptSession,
): void {
  if (session.source !== 'plugin') {
    validateDeviceTranscript(store, principal, source, session);
    return;
  }
  const id = session.plugin_id;
  if (id === null || !principal.plugins.includes(id))
    throw new ApiError('forbidden', 'The speech plugin was not admitted.');
  if (source !== null && (source.kind !== 'plugin' || source.pluginId !== id))
    throw new ApiError('forbidden', 'The speech occurrence belongs to another plugin.');
  store.transcripts.byId(session.id);
  const reader = pluginReader(store, id);
  admitSpeechReadTool(store, principal, reader.readTool(session));
  reader.validate(
    speechToolCaller(store, principal),
    session,
    source?.kind === 'plugin' ? source.sourceId : undefined,
  );
}

function validateAttachment(
  store: Store,
  principal: SpeechPrincipal,
  source: SpeechSource | null,
  speech: Extract<CommittedSpeech, { kind: 'attachment' }>,
): void {
  if (source !== null && (source.kind !== 'attachment' || source.chatId !== speech.chatId))
    throw new ApiError('forbidden', 'The speech occurrence belongs to another source.');
  admitSpeechReadTool(store, principal, { name: 'read_chats' });
  const file = store.assistantChat.attachment(speech.attachmentId);
  if (file.profile_id !== principal.profileId || file.profile_id !== speech.profileId)
    throw new ApiError('forbidden', 'The speech attachment belongs to another profile.');
  if (speech.chatId !== null) ownSpeechChat(store, principal, speech.chatId);
}

function validateDeviceTranscript(
  store: Store,
  principal: SpeechPrincipal,
  source: SpeechSource | null,
  session: TranscriptSession,
): void {
  if (
    source !== null &&
    (source.kind !== session.source ||
      !('deviceId' in source) ||
      source.deviceId !== session.source_id)
  )
    throw new ApiError('forbidden', 'The speech occurrence belongs to another device.');
  admitDeviceSpeech(store, principal, { kind: session.source, deviceId: session.source_id });
  store.transcripts.byId(session.id);
}
