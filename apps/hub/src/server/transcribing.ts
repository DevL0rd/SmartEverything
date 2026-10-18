import { randomUUID } from 'node:crypto';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { TurnSession } from '../assistant-voice/turn-session';
import { EarHosts } from '../listening/ear-hosts';
import { EndOfSpeechPause } from '../listening/end-of-speech-pause';
import { HubRemoteEars } from '../listening/remote-ears';
import { DeviceListeningSwitches } from '../listening/listening-switches';
import { assistantNames } from '../assistant-voice/persona';
import type { PluginVoiceServices } from '../plugins/plugin-voice';
import { CameraListening } from '../transcripts/camera-listening';
import { Transcriber } from '../transcripts/transcriber';
import { OpenRouterTranscription } from '../openrouter/transcription';
import { Transcripts } from '../transcripts/transcript-service';
import { Ears } from '../wake-name/ear';
import type { EarKeywords, KeywordSpotter } from '../wake-name/keyword-spotter';
import { WakeClaims } from '../wake-name/wake-claims';
import { WakeDiagnostics } from '../wake-name/wake-diagnostics';
import { WakeTest, type WakeTestSource } from '../wake-name/wake-test';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';

export interface Transcribing {
  readonly transcripts: Transcripts;
  readonly listening: CameraListening;
  readonly ears: Ears;
  readonly earHosts: EarHosts;
  readonly remoteEars: HubRemoteEars;
  readonly claims: WakeClaims;
  readonly wakeTest: WakeTest;
  readonly transcriber: Transcriber;
  readonly plugins: PluginVoiceServices;
}

interface DiagnosticsParts {
  readonly transcriber: Transcriber;
  readonly names: () => readonly string[];
  readonly spotter: () => KeywordSpotter;
  readonly log: BuildOptions['log'];
}

function diagnosticsOf(
  options: BuildOptions,
  context: ServerContext,
  parts: DiagnosticsParts,
): WakeDiagnostics {
  const { store, clock } = options;
  const diagnostics = new WakeDiagnostics({
    dataDirectory: options.dataDirectory,
    spotter: parts.spotter,
    names: parts.names,
    transcribe: (pcm16k): Promise<string | null> =>
      context.openRouter.keys.current() === null
        ? Promise.resolve(null)
        : parts.transcriber.transcribe({
            pcm16k,
            profileId: store.profiles.first().id,
            pluginId: null,
            names: parts.names(),
            recent: [],
            meta: { source: 'wake_diagnostics' },
          }),
    clock,
    log: parts.log,
  });
  diagnostics.start().catch((cause: unknown) => {
    parts.log.error('wake.diagnostic_watch_failed', cause);
  });
  return diagnostics;
}

function earsOf(
  options: BuildOptions,
  context: ServerContext,
  transcriber: Transcriber,
): { readonly claims: WakeClaims; readonly ears: Ears } {
  const { clock } = options;
  const log = options.log.forArea('hub.wake-name');
  const names = (): string[] => assistantNames(options.store);
  const claims = new WakeClaims({ clock, log });
  const ears = new Ears({
    claims,
    names,
    pause: new EndOfSpeechPause(options.store),
    clock,
    log,
    ...(options.wakeDiagnostics === true
      ? {
          diagnostics: (spotter: () => KeywordSpotter): WakeDiagnostics =>
            diagnosticsOf(options, context, { transcriber, names, spotter, log }),
        }
      : {}),
  });
  return { claims, ears };
}

function remoteEarsOf(
  options: BuildOptions,
  context: ServerContext,
  parts: {
    readonly claims: WakeClaims;
    readonly ears: Ears;
    readonly wakeTest: WakeTest;
  },
): { readonly earHosts: EarHosts; readonly remoteEars: HubRemoteEars } {
  const log = options.log.forArea('hub.listening');
  const earHosts = new EarHosts({ store: options.store, log });
  const remoteEars = new HubRemoteEars({
    hosts: earHosts,
    claims: parts.claims,
    test: parts.wakeTest,
    pause: parts.ears.pause,
    names: (): string[] => assistantNames(options.store),
    keywords: (names, sensitivity): EarKeywords =>
      parts.ears.spotter().earConfig(names, sensitivity),
    clock: options.clock,
    log,
  });
  earHosts.start();
  remoteEars.start();
  context.computerEars.bindHosts(earHosts);
  return { earHosts, remoteEars };
}

function wakeTestOf(
  options: BuildOptions,
  context: ServerContext,
  parts: { readonly transcriber: Transcriber; readonly ears: Ears },
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
    nearHears: (pcm, sensitivity): Promise<boolean> =>
      parts.ears.spotter().nearHears(assistantNames(store), sensitivity, pcm),
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
    readonly ears: Ears;
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
    ears: parts.ears,
    transcripts: parts.transcripts,
    transcriber: parts.transcriber,
    names: (): string[] => assistantNames(store),
    keyPresent: (): boolean => voice.keys.current() !== null,
    clock,
    log: options.log.forArea('hub.transcripts'),
  };
}

export function startTranscribing(
  options: BuildOptions,
  context: ServerContext,
  voice: AssistantVoice,
): Transcribing {
  const { store, clock } = options;
  const log = options.log.forArea('hub.transcripts');
  const names = (): string[] => assistantNames(store);
  const transcripts = new Transcripts({ store, clock, log });
  transcripts.start();
  const transcriber = new Transcriber({
    provider: new OpenRouterTranscription(context.openRouter.client),
    ledger: store.ledger,
    log,
  });
  const { claims, ears } = earsOf(options, context, transcriber);
  const wakeTest = wakeTestOf(options, context, { transcriber, ears });
  const { earHosts, remoteEars } = remoteEarsOf(options, context, { claims, ears, wakeTest });
  const listening = new CameraListening({
    store,
    transcripts,
    transcriber,
    ready: (cameraId): Promise<void> => options.core.hub.streamReady(cameraId),
    keyPresent: (): boolean => context.openRouter.keys.current() !== null,
    inConversation: (cameraId): boolean =>
      store.aiOutreach.open().some((row) => row.how === 'camera' && row.target === cameraId),
    names,
    clock,
    log,
  });
  const plugins = pluginVoiceOf(options, context, voice, { ears, transcripts, transcriber });
  return {
    transcripts,
    listening,
    ears,
    earHosts,
    remoteEars,
    claims,
    wakeTest,
    transcriber,
    plugins,
  };
}
