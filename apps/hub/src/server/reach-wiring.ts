import { assistantLabel } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { Clock } from '../clock';
import type { PluginSpeakers } from '../plugins/plugin-reach';
import type { PresenceSources } from '../reach/presence';
import { AppSpeech } from '../reach/app-speech';
import { CameraFraming } from '../reach/camera-framing';
import { ReachRules } from '../reach/reach-rules';
import { ReachService, type ReachAssistant } from '../reach/reach-service';
import { outcomeOrigin } from '../reach/reach-text';
import { ringTransports } from '../reach/ring-transports';
import type { Saying } from '../speech/one-shot-speech';
import type { LiveOpening } from '../talk/relay';
import type { ServerContext } from './context';
import { reachRoutes, type Reach, type ReachRoutes } from './handlers/reach';
import type { Transcribing } from './transcribing';
import { startTalkListening } from './talk-wiring';
import { startWakeName } from './wake-wiring';

export interface StartedReach {
  readonly routes: ReachRoutes;
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
      await assistant.post({ text, files: [], profileId: personId, notify: true }, false);
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

function framingOf(context: ServerContext, options: ReachWiring, log: Logger): CameraFraming {
  return new CameraFraming({
    store: context.store,
    submit: (commands): void => {
      context.hub.submit(commands);
    },
    clock: options.clock,
    log,
  });
}

export interface ReachLinks {
  readonly speakers: PluginSpeakers;
  readonly transcribing: Pick<
    Transcribing,
    'ears' | 'claims' | 'listening' | 'transcriber' | 'transcripts'
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
    say: (request): Promise<Saying> => voice.say(request),
    app: parts.speech,
    framing: framingOf(context, options, log),
    openLive: (channelId, conversation): LiveOpening =>
      context.talk.openLive(channelId, conversation),
    clock: options.clock,
    log,
  });
}

function speechOf(context: ServerContext, options: ReachWiring, log: Logger): AppSpeech {
  return new AppSpeech({
    online: (): ReadonlySet<string> => context.live.connectedClients(),
    toClient: (clientId, notice): Promise<number> => context.live.deliver(clientId, notice),
    pushTargets: (): ReadonlySet<string> =>
      new Set(context.store.personal.pushTargets().map((target) => target.client_id)),
    pushConfigured: (): boolean => context.secrets.read().pushServiceAccount !== null,
    push: context.pushCommands,
    clock: options.clock,
    log,
  });
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
  const wake = startWakeName(context, {
    rules,
    service,
    ears: transcribing.ears,
    claims: transcribing.claims,
    speech: (cameraId, segment): void => {
      transcribing.listening.segment(cameraId, segment);
    },
    clock: options.clock,
    log: options.log,
  });
  startTalkListening(context, { transcribing, service, voice }, options);
  return {
    routes: reachRoutes(context, reach),
    stop: (): void => {
      wake
        .stop()
        .then(() => {
          transcribing.ears.free();
        })
        .catch((cause: unknown) => {
          log.error('wake.stop_failed', cause);
        });
    },
  };
}
