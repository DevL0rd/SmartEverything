import { assistantLabel, type TranscriptPauseReason } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { Clock } from '../clock';
import type { PluginSpeakers } from '../plugins/plugin-speakers';
import type { PresenceSources } from '../reach/presence';
import { AppSpeech } from '../reach/app-speech';
import { CameraFraming } from '../reach/camera-framing';
import { ReachRules } from '../reach/reach-rules';
import { ReachService, type ReachAssistant } from '../reach/reach-service';
import { outcomeOrigin } from '../reach/reach-text';
import { ringTransports } from '../reach/ring-transports';
import type { CameraListening } from '../transcripts/camera-listening';
import type { Saying } from '../speech/one-shot-speech';
import type { LiveOpening } from '../talk/relay';
import type { ServerContext } from './context';
import { emitReachSignals } from './reach-signals';
import { listeningRoutes, type ListeningRoutes } from './handlers/listening';
import { reachRoutes, type Reach, type ReachRoutes } from './handlers/reach';
import { discordVoiceOf } from '../computers/discord-voice';
import { mirrorDiscordCall } from '../listening/discord-row';
import { ListeningRegistry } from '../listening/listening-registry';
import { VoiceActivity } from '../listening/voice-activity';
import { opusCodec } from '../assistant-voice/audio';
import type { Transcribing } from './transcribing';
import { startComputerEars } from './computer-ear-wiring';
import { startPhoneEars } from './phone-ear-wiring';
import { startTalkListening } from './talk-wiring';
import { startWakeName } from './wake-wiring';

export interface StartedReach {
  readonly routes: ReachRoutes & ListeningRoutes;
  readonly listening: ListeningRegistry;
  readonly stop: () => void;
}

export interface ReachWiring {
  readonly clock: Clock;
  readonly log: Logger;
}

function assistantOf(context: ServerContext): ReachAssistant {
  const { assistant, store } = context;
  return {
    conversationChat: (profileId, title): string =>
      assistant.chats.conversationChat(profileId, title).id,
    turn: (chatId, text, origin): void => {
      assistant.runTurn({
        profileId: store.aiChats.chat(chatId).profile_id,
        chatId,
        text,
        origin: outcomeOrigin(origin),
      });
    },
    message: async (personId, text): Promise<string> => {
      const chatId = assistant.chats.defaultChat(personId).id;
      await assistant.post({ text, files: [], profileId: personId, notify: true }, false, {
        profileId: personId,
        role: 'owner',
      });
      return chatId;
    },
    aiName: (): string => assistantLabel(store.assistantChat.settings()),
    liveVideo: (): boolean => store.assistantChat.settings().voice.live_video,
    muteMic: (): boolean => store.assistantChat.settings().voice.mute_mic_while_speaking,
  };
}

function presenceOf(context: ServerContext, rules: ReachRules, now: () => Date): PresenceSources {
  return {
    store: context.store,
    rules,
    online: () => context.live.connectedClients(),
    seen: () =>
      context.hub.signals
        .latest({ source: 'event' })
        .filter((signal) => signal.kind === 'person' || signal.kind === 'motion'),
    phone: (personId, viewerId) => context.hub.phones.contextOf(personId, viewerId),
    now,
  };
}

function framingOf(context: ServerContext, log: Logger): CameraFraming {
  return new CameraFraming({
    store: context.store,
    submit: (commands): void => {
      context.hub.submit(commands);
    },
    log,
  });
}

export interface ReachLinks {
  readonly speakers: PluginSpeakers;
  readonly transcribing: Pick<
    Transcribing,
    | 'pause'
    | 'keywords'
    | 'earHosts'
    | 'remoteEars'
    | 'claims'
    | 'listening'
    | 'transcriber'
    | 'transcripts'
    | 'wakeTest'
  >;
}

function serviceOf(
  context: ServerContext,
  voice: AssistantVoice,
  parts: {
    readonly rules: ReachRules;
    readonly speakers: PluginSpeakers;
    readonly options: ReachWiring;
    readonly speech: AppSpeech;
  },
): ReachService {
  const { rules, speakers, options } = parts;
  const log = options.log.forArea('hub.reach');
  const assistant = assistantOf(context);
  return new ReachService({
    store: context.store,
    rules,
    speakers,
    assistant,
    transports: ringTransports({
      store: context.store,
      online: () => context.live.connectedClients(),
      push: context.pushCommands,
      pushConfigured: (): boolean => context.secrets.read().pushServiceAccount !== null,
      aiName: assistant.aiName,
      log,
    }),
    host: (request): Promise<HostedCall> => voice.host(request),
    camera: context.talk.camera,
    computer: { audio: context.computerEars.audio, activity: voiceActivityOf(context, options) },
    say: (request): Promise<Saying> => voice.say(request),
    app: parts.speech,
    framing: framingOf(context, log),
    openLive: (channelId, conversation): LiveOpening =>
      context.talk.openLive(channelId, conversation),
    clock: options.clock,
    log,
  });
}

function speechOf(context: ServerContext, options: ReachWiring, log: Logger): AppSpeech {
  return new AppSpeech({
    online: (): ReadonlySet<string> => context.live.connectedClients(),
    toClient: (clientId, notice): Promise<number> =>
      context.live.deliver(clientId, notice, 'foreground'),
    pushTargets: (): ReadonlySet<string> =>
      new Set(context.store.personal.pushTargets().map((target) => target.client_id)),
    pushConfigured: (): boolean => context.secrets.read().pushServiceAccount !== null,
    push: context.pushCommands,
    clock: options.clock,
    log,
  });
}

function listeningOf(
  context: ServerContext,
  rules: ReachRules,
  transcribing: Pick<CameraListening, 'status'>,
  options: ReachWiring,
): ListeningRegistry {
  const listening = new ListeningRegistry({
    store: context.store,
    rules,
    cameraPauses: async (): Promise<ReadonlyMap<string, TranscriptPauseReason>> =>
      new Map(
        (await transcribing.status()).cameras.flatMap((camera) =>
          camera.state === 'paused' ? [[camera.camera_id, camera.reason] as const] : [],
        ),
      ),
    announce: (): void => {
      context.store.feed.notice({ type: 'listening_changed' });
    },
    connected: (): ReadonlySet<string> => context.live.connectedClients(),
    sendLevel: (clientId, sourceKey, dbfs): void => {
      context.live.toClient(clientId, { type: 'listening_level', sourceKey, dbfs });
    },
    log: options.log.forArea('hub.listening'),
  });
  listening.start();
  return listening;
}

function startCameraWake(
  context: ServerContext,
  parts: {
    readonly rules: ReachRules;
    readonly service: ReachService;
    readonly transcribing: ReachLinks['transcribing'];
  },
  options: ReachWiring,
): ReturnType<typeof startWakeName> {
  const { rules, service, transcribing } = parts;
  return startWakeName(context, {
    rules,
    service,
    ears: transcribing.remoteEars,
    test: transcribing.wakeTest,
    speech: (cameraId, segment): void => {
      transcribing.wakeTest.segment({ kind: 'camera', key: cameraId }, segment);
      if (context.store.cameras.find(cameraId)?.transcribe === true) {
        transcribing.listening.segment(cameraId, segment);
      }
    },
    clock: options.clock,
    log: options.log,
  });
}

function startDeviceEars(
  context: ServerContext,
  parts: {
    readonly listening: ListeningRegistry;
    readonly transcribing: ReachLinks['transcribing'];
    readonly service: ReachService;
  },
  options: ReachWiring,
): { readonly phones: ReturnType<typeof startPhoneEars>; readonly stop: () => void } {
  const { listening, transcribing, service } = parts;
  const discord = discordVoiceOf(context.store);
  const unwatch = discord.start();
  const unmirror = mirrorDiscordCall(listening, discord);
  const phones = startPhoneEars(context, { listening, transcribing }, options);
  const computers = startComputerEars(
    context,
    { listening, transcribing, service, relay: context.computerEars, discord },
    options,
  );
  return {
    phones,
    stop: (): void => {
      phones.stop();
      computers.stop();
      unmirror();
      unwatch();
    },
  };
}

function voiceActivityOf(context: ServerContext, options: ReachWiring): VoiceActivity {
  const codec = opusCodec();
  const activity = new VoiceActivity({
    announce: (notice, profileId): void => {
      if (profileId === null) {
        context.live.announce(notice, 'owners');
      } else {
        context.live.profileNotice(notice, profileId, 'everyone');
      }
    },
    decode: codec.decode,
    now: (): number => options.clock.now().getTime(),
  });
  context.live.voice.attach(activity);
  return activity;
}

function followContests(
  context: ServerContext,
  parts: {
    readonly voice: AssistantVoice;
    readonly listening: ListeningRegistry;
    readonly transcribing: Pick<ReachLinks['transcribing'], 'claims'>;
  },
  options: ReachWiring,
): () => void {
  const { voice, listening, transcribing } = parts;
  const stopContests = transcribing.claims.onArbitrated((arbitrated) => {
    listening.contested(arbitrated);
  });
  const stopSignals = emitReachSignals(
    context.hub.signals,
    { voice, listening, claims: transcribing.claims },
    options.clock.now,
  );
  return (): void => {
    stopSignals();
    stopContests();
  };
}

function startRemoteEars(
  transcribing: Pick<ReachLinks['transcribing'], 'remoteEars' | 'earHosts'>,
  listening: Pick<ListeningRegistry, 'setState'>,
): () => void {
  const unstate = transcribing.remoteEars.onState(({ key, state }) => {
    listening.setState(key, state);
  });
  return (): void => {
    unstate();
    transcribing.remoteEars.stop();
    transcribing.earHosts.close();
  };
}

export function startReach(
  context: ServerContext,
  voice: AssistantVoice,
  options: ReachWiring,
  links: ReachLinks,
): StartedReach {
  const log = options.log.forArea('hub.reach');
  const rules = new ReachRules(context.store, options.clock.now);
  const speech = speechOf(context, options, log);
  const service = serviceOf(context, voice, { rules, speakers: links.speakers, options, speech });
  service.start();
  voice.attachOutreach(service);
  const reach: Reach = {
    service,
    rules,
    speech,
    presence: presenceOf(context, rules, options.clock.now),
  };
  const { transcribing } = links;
  const listening = listeningOf(context, rules, transcribing.listening, options);
  const stopContests = followContests(context, { voice, listening, transcribing }, options);
  const stopRemoteEars = startRemoteEars(transcribing, listening);
  const wake = startCameraWake(context, { rules, service, transcribing }, options);
  startTalkListening(context, { transcribing, service, voice }, options);
  const devices = startDeviceEars(context, { listening, transcribing, service }, options);
  return {
    routes: {
      ...reachRoutes(context, reach),
      ...listeningRoutes(context, listening, devices.phones, transcribing.wakeTest),
    },
    listening,
    stop: (): void => {
      devices.stop();
      stopContests();
      stopRemoteEars();
      listening.stop();
      wake
        .stop()
        .then(() => {
          transcribing.pause.close();
        })
        .catch((cause: unknown) => {
          log.error('wake.stop_failed', cause);
        });
    },
  };
}
