import { randomUUID } from 'node:crypto';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { TurnSession } from '../assistant-voice/turn-session';
import { EarHosts } from '../listening/ear-hosts';
import { EndOfSpeechPause } from '../listening/end-of-speech-pause';
import { nearHeardBy } from '../listening/near-score';
import { HubRemoteEars } from '../listening/remote-ears';
import { DeviceListeningSwitches } from '../listening/listening-switches';
import { assistantNames } from '../assistant-voice/persona';
import type { PluginVoiceServices } from '../plugins/plugin-voice';
import { CameraListening } from '../transcripts/camera-listening';
import { Transcriber } from '../transcripts/transcriber';
import { OpenRouterTranscription } from '../openrouter/transcription';
import { Transcripts } from '../transcripts/transcript-service';
import { WakeKeywords, type EarKeywords } from '../wake-name/keyword-lines';
import { WakeClaims } from '../wake-name/wake-claims';
import { WakeTest, type WakeTestSource } from '../wake-name/wake-test';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';

export interface Transcribing {
  readonly transcripts: Transcripts;
  readonly listening: CameraListening;
  readonly pause: EndOfSpeechPause;
  readonly keywords: WakeKeywords;
  readonly earHosts: EarHosts;
  readonly remoteEars: HubRemoteEars;
  readonly claims: WakeClaims;
  readonly wakeTest: WakeTest;
  readonly transcriber: Transcriber;
  readonly plugins: PluginVoiceServices;
}

function remoteEarsOf(
  options: BuildOptions,
  context: ServerContext,
  parts: {
    readonly claims: WakeClaims;
    readonly pause: EndOfSpeechPause;
    readonly keywords: WakeKeywords;
    readonly wakeTest: WakeTest;
    readonly earHosts: EarHosts;
  },
): HubRemoteEars {
  const log = options.log.forArea('hub.listening');
  const { earHosts } = parts;
  const remoteEars = new HubRemoteEars({
    hosts: earHosts,
    claims: parts.claims,
    test: parts.wakeTest,
    pause: parts.pause,
    names: (): string[] => assistantNames(options.store),
    keywords: (names, sensitivity): EarKeywords => parts.keywords.earConfig(names, sensitivity),
    clock: options.clock,
    log,
  });
  earHosts.start();
  remoteEars.start();
  context.computerEars.bindHosts(earHosts);
  return remoteEars;
}

function wakeTestOf(
  options: BuildOptions,
  context: ServerContext,
  parts: {
    readonly transcriber: Transcriber;
    readonly earHosts: EarHosts;
    readonly keywords: WakeKeywords;
  },
): WakeTest {
  const { store } = options;
  const switches = new DeviceListeningSwitches(store);
  return new WakeTest({
    connected: (): ReadonlySet<string> => context.live.connectedClients(),
    send: (clientId, line): void => {
      context.live.toClient(clientId, { type: 'wake_test_heard', line });
    },
    transcribe: (pcm16k): Promise<string | null> =>
      context.openRouter.keys.current() === null
        ? Promise.resolve(null)
        : parts.transcriber.transcribe({
            pcm16k,
            profileId: store.profiles.first().id,
            pluginId: null,
            names: [],
            recent: [],
            meta: { source: 'wake_test' },
          }),
    nearHears: nearHeardBy({
      keywords: parts.keywords,
      names: (): string[] => assistantNames(store),
      hosts: parts.earHosts,
      log: options.log.forArea('hub.wake-name'),
    }),
    sensitivity: (source: WakeTestSource) =>
      source.kind === 'camera'
        ? store.cameras.byDevice(source.key).wake_sensitivity
        : switches.read(source.key).sensitivity,
    label: (source: WakeTestSource): string => {
      const device = store.devices.find(source.key);
      return device === undefined ? source.kind : (device.display_name ?? device.name);
    },
    id: randomUUID,
    clock: options.clock,
    log: options.log.forArea('hub.wake-name'),
  });
}

function pluginVoiceOf(
  options: BuildOptions,
  context: ServerContext,
  voice: AssistantVoice,
  parts: {
    readonly remoteEars: HubRemoteEars;
    readonly transcripts: Transcripts;
    readonly transcriber: Transcriber;
  },
): PluginVoiceServices {
  const { store, clock } = options;
  return {
    store,
    host: (request): Promise<HostedCall> => voice.host(request),
    turn: (request): Promise<TurnSession> => voice.turn(request),
    chat: (profileId, title, source): string =>
      (source === null
        ? context.assistant.chats.conversationChat(profileId, title)
        : context.assistant.chats.chatForPlugin(profileId, source, title)
      ).id,
    keys: { changes: (listener) => voice.keys.changes(listener) },
    ears: parts.remoteEars,
    transcripts: parts.transcripts,
    transcriber: parts.transcriber,
    names: (): string[] => assistantNames(store),
    keyPresent: (): boolean => voice.keys.current() !== null,
    clock,
    log: options.log.forArea('hub.transcripts'),
  };
}

function cameraListeningOf(
  options: BuildOptions,
  context: ServerContext,
  parts: { readonly transcripts: Transcripts; readonly transcriber: Transcriber },
): CameraListening {
  const { store, clock } = options;
  return new CameraListening({
    store,
    transcripts: parts.transcripts,
    transcriber: parts.transcriber,
    ready: (cameraId): Promise<void> => options.core.hub.streamReady(cameraId),
    keyPresent: (): boolean => context.openRouter.keys.current() !== null,
    inConversation: (cameraId): boolean =>
      store.aiOutreach.open().some((row) => row.how === 'camera' && row.target === cameraId),
    names: (): string[] => assistantNames(store),
    clock,
    log: options.log.forArea('hub.transcripts'),
  });
}

export function startTranscribing(
  options: BuildOptions,
  context: ServerContext,
  voice: AssistantVoice,
): Transcribing {
  const { store, clock } = options;
  const log = options.log.forArea('hub.transcripts');
  const transcripts = new Transcripts({ store, clock, log });
  transcripts.start();
  const transcriber = new Transcriber({
    provider: new OpenRouterTranscription(context.openRouter.client),
    ledger: store.ledger,
    log,
  });
  const claims = new WakeClaims({ clock, log: options.log.forArea('hub.wake-name') });
  const pause = new EndOfSpeechPause(store);
  const keywords = new WakeKeywords();
  const earHosts = new EarHosts({ store, log: options.log.forArea('hub.listening') });
  const wakeTest = wakeTestOf(options, context, { transcriber, earHosts, keywords });
  const remoteEars = remoteEarsOf(options, context, {
    claims,
    pause,
    keywords,
    wakeTest,
    earHosts,
  });
  const listening = cameraListeningOf(options, context, { transcripts, transcriber });
  const plugins = pluginVoiceOf(options, context, voice, { remoteEars, transcripts, transcriber });
  return {
    transcripts,
    listening,
    pause,
    keywords,
    earHosts,
    remoteEars,
    claims,
    wakeTest,
    transcriber,
    plugins,
  };
}
