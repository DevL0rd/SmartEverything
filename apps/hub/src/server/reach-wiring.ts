import { assistantLabel } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Announcement } from '../assistant-voice/announcer';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { Clock } from '../clock';
import type { PresenceSources } from '../reach/presence';
import { CameraFraming } from '../reach/camera-framing';
import { ReachRules } from '../reach/reach-rules';
import { ReachService, type ReachAssistant } from '../reach/reach-service';
import { ringTransports } from '../reach/ring-transports';
import type { LiveOpening } from '../talk/relay';
import type { ServerContext } from './context';
import { reachRoutes, type Reach, type ReachRoutes } from './handlers/reach';
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
    turn: (chatId, text): void => {
      assistant.runTurn({
        profileId: store.aiChats.chat(chatId).profile_id,
        chatId,
        text,
        origin: { source: 'wake', plugin_id: null, device_id: null, name: 'Outreach' },
      });
    },
    message: async (personId, text): Promise<string> => {
      const chatId = assistant.chats.defaultChat(personId).id;
      await assistant.post({ text, files: [], profileId: personId, notify: true }, false);
      return chatId;
    },
    aiName: (): string => assistantLabel(store.assistantChat.settings()),
    liveVideo: (): boolean => store.assistantChat.settings().voice.live_video,
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

export function startReach(
  context: ServerContext,
  voice: AssistantVoice,
  options: ReachWiring,
): StartedReach {
  const log = options.log.forArea('hub.reach');
  const rules = new ReachRules(context.store, options.clock.now);
  const assistant = assistantOf(context);
  const service = new ReachService({
    store: context.store,
    rules,
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
    announce: (request): Promise<Announcement> => voice.announce(request),
    deliver: (clientId, notice): number => context.live.toClient(clientId, notice),
    framing: new CameraFraming({
      store: context.store,
      submit: (commands): void => {
        context.hub.submit(commands);
      },
      clock: options.clock,
      log,
    }),
    openLive: (channelId, conversation): LiveOpening =>
      context.talk.openLive(channelId, conversation),
    clock: options.clock,
    log,
  });
  service.start();
  voice.attachOutreach(service);
  const reach: Reach = { service, rules, presence: presenceOf(context, rules, options.clock.now) };
  const wake = startWakeName(context, { rules, service, clock: options.clock, log: options.log });
  return {
    routes: reachRoutes(context, reach),
    stop: (): void => {
      wake.stop().catch((cause: unknown) => {
        log.error('wake.stop_failed', cause);
      });
    },
  };
}
