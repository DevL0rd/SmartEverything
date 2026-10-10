import { join } from 'node:path';
import type { HubStatus, PublicStatus } from '@smarteverything/domain';
import { OpenCalls } from '../assistant-voice/open-calls';
import { FoodLookup } from '../foods/food-lookup';
import { PushCommandChannel } from '../extensions/push/commands';
import { WatchActionBroker } from '../local/watch-actions';
import { WatchDataService } from '../local/watch-data';
import { createOpenRouter } from '../openrouter/platform';
import { PlaceFinder } from '../places/place-finder';
import { TalkService } from '../talk/talk-service';
import { GeminiMediaNotes, MediaNotes } from '../transcripts/media-notes';
import { WeatherService } from '../weather/weather-service';
import { ExchangeRateService } from '../exchange-rates/exchange-rate-service';
import { AccessService } from './access';
import { assistantOf } from './assistant-wiring';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import type { LiveHub } from './live';
import { MediaLinks } from './media-links';
import { PublicUrlVerifier } from './public-url';

export function statusOf(options: BuildOptions): {
  status: () => HubStatus;
  publicStatus: () => PublicStatus;
} {
  const startedAt = options.clock.now();
  return {
    status: () => ({
      version: options.version,
      startedAt: startedAt.toISOString(),
      cameras: options.core.supervisor.isRunning() ? 'running' : 'stopped',
    }),
    publicStatus: (): PublicStatus => {
      const settings = options.store.settings.read();
      return {
        service: 'smarteverything',
        version: options.version,
        uptimeSeconds: Math.floor((options.clock.now().getTime() - startedAt.getTime()) / 1000),
        publicUrl: {
          configured: settings.public_url !== null,
          verified: settings.public_url_verified_at !== null,
        },
      };
    },
  };
}

export type Statuses = ReturnType<typeof statusOf>;

function talkOf(options: BuildOptions, live: LiveHub): TalkService {
  return new TalkService({
    store: options.store,
    go2rtc: options.core.go2rtc,
    streamReady: (deviceId) => options.core.hub.streamReady(deviceId),
    rtspPort: options.core.rtspPort,
    dataDirectory: options.dataDirectory,
    presence: (presence): void => {
      live.announce({ type: 'talk_floors', ...presence }, 'talk');
    },
    now: options.clock.now,
    log: options.log.forArea('hub.talk'),
  });
}

function accessOf(options: BuildOptions, live: LiveHub): AccessService {
  return new AccessService({
    store: options.store,
    dataDirectory: options.dataDirectory,
    now: options.clock.now,
    ownerChanged: (clientId): void => {
      live.closeClient(clientId);
    },
  });
}

function outboundOf(
  options: BuildOptions,
): Pick<ServerContext, 'weather' | 'exchangeRates' | 'openRouter' | 'places' | 'mediaNotes'> {
  const openRouter = createOpenRouter({
    models: options.store.aiModels,
    secrets: options.secrets,
    clock: options.clock,
    fetch: options.fetch,
    log: options.log.forArea('hub.openrouter'),
  });
  return {
    mediaNotes: new MediaNotes({
      provider: new GeminiMediaNotes(() => options.secrets.read().geminiKey),
      chat: options.store.assistantChat,
      ledger: options.store.ledger,
      prices: openRouter.catalogue,
      filesRoot: join(options.dataDirectory, 'assistant'),
      log: options.log.forArea('hub.assistant'),
    }),
    openRouter,
    weather: new WeatherService({
      store: options.store,
      request: { fetch: options.fetch, version: options.version },
      clock: options.clock,
      log: options.log.forArea('hub.weather'),
    }),
    exchangeRates: new ExchangeRateService({
      store: options.store,
      request: { fetch: options.fetch, version: options.version },
      clock: options.clock,
      log: options.log.forArea('hub.exchange-rates'),
    }),
    places: new PlaceFinder({
      request: { fetch: options.fetch, version: options.version },
      now: options.clock.now,
      log: options.log.forArea('hub.places'),
    }),
  };
}

export function contextOf(options: BuildOptions, live: LiveHub, statuses: Statuses): ServerContext {
  const log = options.log.forArea('hub.server');
  const pushCommands = new PushCommandChannel();
  pushCommands.attachLive((clientId, notice, receiver) => live.deliver(clientId, notice, receiver));
  return {
    store: options.store,
    hub: options.core.hub,
    firewall: options.core.firewall,
    secrets: options.secrets,
    access: accessOf(options, live),
    links: new MediaLinks(options.clock.now),
    publicUrl: new PublicUrlVerifier({ store: options.store, fetch: options.fetch, log }),
    foodLookup: new FoodLookup({
      foods: options.store.foods,
      fetch: options.fetch,
      now: options.clock.now,
      version: options.version,
      log,
    }),
    live,
    pushCommands,
    openCalls: new OpenCalls(),
    talk: talkOf(options, live),
    assistant: assistantOf(options, live),
    watchActions: new WatchActionBroker(
      pushCommands,
      options.store,
      options.log.forArea('hub.watch'),
    ),
    watchData: new WatchDataService({ store: options.store, now: options.clock.now }),
    ...outboundOf(options),
    ...statuses,
    recordingPath: options.core.recordingPath,
    log,
  };
}
