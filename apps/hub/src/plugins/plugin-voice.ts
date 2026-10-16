import { randomUUID } from 'node:crypto';
import {
  DEFAULT_WAKE_SENSITIVITY,
  pluginChatKey,
  requesterOf,
  turnRoleOf,
  type AssistantVoiceServerMessage,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HostedCallRequest, HostedListening } from '../assistant-voice/outreach';
import type { VideoFrame } from '../assistant-voice/video';
import type { Picture } from '../assistant-voice/gemini';
import type { TurnSession, TurnEvents, TurnTool } from '../assistant-voice/turn-session';
import type { TurnRequest } from '../assistant-voice/turn-sessions';
import type { Clock } from '../clock';
import { REACH_TOOL_NAMES, hostLine, type HostVoice } from '../reach/hosted-call';
import type { CallText } from '../store/repositories/assistant-chat';
import type { Store } from '../store/store';
import { ownerProfileOf } from '../transcripts/owner';
import type { Transcriber } from '../transcripts/transcriber';
import type { Transcripts } from '../transcripts/transcript-service';
import type { Ears, SpeechSegment } from '../wake-name/ear';
import type { Unsubscribe } from './builtin/contract';
import { FIRST_CONVERSATION, earlierBlock } from './earlier-lines';
import { SaidTurns } from './plugin-said';
import {
  openTranscript,
  transcribeFor,
  type PluginTranscribeRequest,
  type PluginTranscript,
  type PluginTranscriptRequest,
} from './plugin-transcribing';
import { transcriptsOf, type PluginTranscripts } from './plugin-transcripts';

const TURN_HIDDEN_TOOLS: ReadonlySet<string> = new Set([...REACH_TOOL_NAMES, 'end_conversation']);

class PluginVoiceDeniedError extends Error {
  override readonly name = 'PluginVoiceDeniedError';

  constructor(readonly pluginId: string) {
    super(`${pluginId} may use voice only when its manifest asks for permissions.voice.`);
  }
}

interface Spoken {
  readonly title: string;
  readonly label: string;
  readonly speaker: string | null;
  readonly place: string | null;
}

interface PluginCallRequest extends Spoken {
  readonly opening: string;
  readonly play: (packet: Uint8Array) => void;
  readonly closed: () => void;
  readonly continuous?: boolean;
  readonly heard?: () => Int16Array;
  readonly said?: (text: string) => void;
  readonly listening?: HostedListening;
}

interface PluginCall {
  readonly id: string;
  readonly hear: (pcm16k: Int16Array) => void;
  readonly see: (frame: VideoFrame) => void;
  readonly note: (text: string) => void;
  readonly say: (text: string) => void;
  readonly mute: (muted: boolean) => void;
  readonly end: () => Promise<void>;
}

interface PluginConversation {
  readonly key: string;
  readonly earlier: number;
}

interface PluginTurnRequest extends Spoken {
  readonly opening: string | null;
  readonly tools: readonly TurnTool[];
  readonly events: TurnEvents;
  readonly conversation?: PluginConversation;
  readonly hidden?: readonly string[];
  readonly ending?: string;
  readonly bare?: boolean;
}

interface PluginTurn {
  readonly id: string;
  readonly begin: () => void;
  readonly hear: (pcm16k: Int16Array) => void;
  readonly finish: () => void;
  readonly say: (text: string, respond: boolean) => void;
  readonly picture: (text: string, picture: Picture) => void;
  readonly reopen: (options: { readonly fresh: boolean }) => Promise<void>;
  readonly end: () => void;
}

interface PluginEarRequest {
  readonly speaker: string;
  readonly sensitivity?: () => WakeSensitivity;
  readonly names?: () => readonly string[];
  readonly wake: (phrase: string, words: () => Int16Array) => void;
  readonly speech?: (segment: SpeechSegment) => void;
}

interface PluginEar {
  readonly hear: (pcm16k: Int16Array) => void;
  readonly close: () => Promise<void>;
}

export interface PluginVoice {
  readonly host: (request: PluginCallRequest) => Promise<PluginCall>;
  readonly turn: (request: PluginTurnRequest) => Promise<PluginTurn>;
  readonly ear: (request: PluginEarRequest) => Promise<PluginEar>;
  readonly transcript: (request: PluginTranscriptRequest) => PluginTranscript;
  readonly transcribe: (request: PluginTranscribeRequest) => Promise<string | null>;
  readonly transcripts: PluginTranscripts;
  readonly ready: () => boolean;
  readonly keyChanges: (listener: () => void) => Unsubscribe;
}

export interface PluginVoiceServices {
  readonly store: Pick<Store, 'clients' | 'profiles' | 'pluginPeople' | 'assistantChat'>;
  readonly host: HostVoice;
  readonly turn: (request: TurnRequest) => Promise<TurnSession>;
  readonly chat: (profileId: string, title: string, source: string | null) => string;
  readonly keys: { readonly changes: (listener: () => void) => Unsubscribe };
  readonly ears: Pick<Ears, 'make'>;
  readonly transcripts: Transcripts;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly names: () => readonly string[];
  readonly keyPresent: () => boolean;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export interface Scope {
  readonly pluginId: string;
  readonly track: (stop: Unsubscribe) => Unsubscribe;
}

function callerOf(
  services: PluginVoiceServices,
  scope: Scope,
  spoken: Spoken,
): HostedCallRequest['caller'] {
  const person =
    spoken.speaker === null
      ? undefined
      : services.store.pluginPeople.find(scope.pluginId, spoken.speaker);
  return {
    profileId: ownerProfileOf(services.store),
    role: turnRoleOf(requesterOf(person)),
    label: spoken.label,
    requester: requesterOf(person),
    pluginId: scope.pluginId,
  };
}

function listenerOf(said: (text: string) => void): (message: AssistantVoiceServerMessage) => void {
  const turns = new SaidTurns(said);
  return (message): void => {
    turns.message(message);
  };
}

async function hostCall(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginCallRequest,
): Promise<PluginCall> {
  const caller = callerOf(services, scope, request);
  const callId = randomUUID();
  const line = await hostLine(
    { host: services.host, clock: services.clock, log: services.log },
    {
      key: `plugin:${scope.pluginId}:${callId}`,
      callId,
      caller,
      opening: {
        chatId: services.chat(caller.profileId, request.title, null),
        text: request.opening,
        outreachId: null,
      },
      play: request.play,
      closed: request.closed,
      pluginId: scope.pluginId,
      ...(request.place === null ? {} : { place: request.place }),
      ...(request.continuous === undefined ? {} : { continuous: request.continuous }),
      ...(request.heard === undefined ? {} : { heard: request.heard }),
      ...(request.listening === undefined ? {} : { listening: request.listening }),
      ...(request.said === undefined ? {} : { listen: listenerOf(request.said) }),
    },
  );
  const { call } = line;
  const stop = scope.track(() => {
    void call.end('disconnected');
  });
  return {
    id: callId,
    hear: call.hear,
    see: call.see,
    note: call.note,
    say: call.say,
    mute: call.mute,
    end: async (): Promise<void> => {
      stop();
      await call.end('hung_up');
    },
  };
}

function handleOf(session: TurnSession, stop: Unsubscribe): PluginTurn {
  return {
    id: session.id,
    begin: (): void => {
      session.begin();
    },
    hear: (pcm16k): void => {
      session.hear(pcm16k);
    },
    finish: (): void => {
      session.finish();
    },
    say: (text, respond): void => {
      session.say(text, respond);
    },
    picture: (text, picture): void => {
      session.say(text, true, picture);
    },
    reopen: (options) => session.reopen(options),
    end: (): void => {
      stop();
      session.end('hung_up');
    },
  };
}

function placeOf(
  services: PluginVoiceServices,
  request: PluginTurnRequest,
  chat: { readonly id: string; readonly profileId: string; readonly source: string },
): string | null {
  const { conversation } = request;
  if (conversation === undefined || conversation.earlier === 0) {
    return request.place;
  }
  const { assistantChat } = services.store;
  const rows: readonly CallText[] = assistantChat.callTextsOfSource({
    profileId: chat.profileId,
    sourceKey: chat.source,
    exceptChatId: chat.id,
    limit: conversation.earlier,
  });
  const memory =
    earlierBlock(rows, conversation.earlier, services.clock.now()) ??
    (assistantChat.messageIdsOf(chat.id).length === 0 ? FIRST_CONVERSATION : null);
  return [request.place, memory].filter((part) => part !== null && part !== '').join('\n\n');
}

async function openTurn(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginTurnRequest,
): Promise<PluginTurn> {
  const caller = callerOf(services, scope, request);
  const source =
    request.conversation === undefined
      ? null
      : pluginChatKey(scope.pluginId, request.conversation.key);
  const chatId = services.chat(caller.profileId, request.title, source);
  const session = await services.turn({
    pluginId: scope.pluginId,
    caller,
    chatId,
    place:
      source === null
        ? request.place
        : placeOf(services, request, { id: chatId, profileId: caller.profileId, source }),
    speaking: {
      hiddenTools: new Set([...TURN_HIDDEN_TOOLS, ...(request.hidden ?? [])]),
      ...(request.ending === undefined ? {} : { ending: request.ending }),
    },
    tools: request.tools,
    opening: request.opening,
    events: request.events,
    ...(request.bare === undefined ? {} : { bare: request.bare }),
  });
  const stop = scope.track(() => {
    session.end('disconnected');
  });
  return handleOf(session, stop);
}

async function openEar(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginEarRequest,
): Promise<PluginEar> {
  const ear = await services.ears.make({
    claim: { source: 'voice_call', key: `${scope.pluginId}:${request.speaker}` },
    fields: { pluginId: scope.pluginId, speaker: request.speaker },
    sensitivity: request.sensitivity ?? ((): WakeSensitivity => DEFAULT_WAKE_SENSITIVITY),
    resting: (): boolean => false,
    ...(request.names === undefined ? {} : { names: request.names }),
    wake: request.wake,
    speech: request.speech ?? null,
  });
  const stop = scope.track(() => {
    void ear.close();
  });
  return {
    hear: (pcm16k): void => {
      ear.hear(pcm16k);
    },
    close: async (): Promise<void> => {
      stop();
      await ear.close();
    },
  };
}

export function voiceOf(
  services: PluginVoiceServices,
  scope: Scope,
  allowed: boolean,
): PluginVoice {
  const guarded =
    <A extends unknown[], R>(work: (...args: A) => R) =>
    (...args: A): R => {
      if (!allowed) {
        throw new PluginVoiceDeniedError(scope.pluginId);
      }
      return work(...args);
    };
  const own = transcriptsOf(services.transcripts, scope.pluginId, services.store);
  return {
    host: guarded((request) => hostCall(services, scope, request)),
    turn: guarded((request) => openTurn(services, scope, request)),
    ear: guarded((request) => openEar(services, scope, request)),
    transcript: guarded((request) => openTranscript(services, scope, request)),
    transcribe: guarded((request) => transcribeFor(services, scope, request)),
    transcripts: {
      speechReader: guarded((reader) => scope.track(own.speechReader(reader))),
      list: guarded(own.list),
      find: guarded(own.find),
      page: guarded(own.page),
      scope: guarded(own.scope),
      feed: guarded(own.feed),
      range: guarded(own.range),
      read: guarded((id: string, after: number, limit: number) => own.read(id, after, limit)),
      remove: guarded((id: string) => own.remove(id)),
    },
    ready: guarded(() => services.keyPresent()),
    keyChanges: guarded((listener: () => void) => scope.track(services.keys.changes(listener))),
  };
}
