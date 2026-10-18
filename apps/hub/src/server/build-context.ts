import type { Logger } from '@smarteverything/logging';
import { PreviewService } from '../preview/service';
import { createImageRuntime, type ImageRuntime } from './image-wiring';
import { ComputerAiDirectory } from '../computers/ai-directory';
import { EarsRelay } from '../computers/ears-relay';
import { HarnessService } from '../harness/service';
import { HarnessRoutes } from '../harness/routes';
import { harnessTransport, type HarnessTransportPorts } from '../harness/transport';
import { ComputerNodeAccess } from '../computers/node-access';
import { ComputerHarnessSockets } from './harness-socket';
import { ComputerNodeSockets } from './node-socket';
import { join } from 'node:path';
import type { HubStatus, PublicStatus } from '@smarteverything/domain';
import { OpenCalls } from '../assistant-voice/open-calls';
import { FoodLookup } from '../foods/food-lookup';
import { PushCommandChannel } from '../extensions/push/commands';
import { WatchActionBroker } from '../local/watch-actions';
import { MachineApprovals } from '../machines/approval';
import { WatchDataService } from '../local/watch-data';
import { createOpenRouter } from '../openrouter/platform';
import { OpenRouterTranscription } from '../openrouter/transcription';
import { PlaceFinder } from '../places/place-finder';
import { TalkService } from '../talk/talk-service';
import type { Store } from '../store/store';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { MediaNotes } from '../transcripts/media-notes';
import { OpenRouterMediaNotes } from '../openrouter/media-notes';
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
    ...(options.connections === undefined ? {} : { connections: options.connections }),
    clientWithdrawn: (clientId): void => {
      live.closeClient(clientId);
    },
    clientPaused: (clientId): void => {
      live.reconnectClient(clientId);
    },
  });
}

function modalitiesOf(store: Store, file: StoredAttachment): readonly string[] | null {
  if (file.message_id === null) return null;
  const chat = store.aiChats.chat(store.assistantChat.message(file.message_id).chat_id);
  if (chat.engine.kind !== 'dsh') return null;
  const model = chat.engine.model;
  return store.aiModels.all().find((row) => row.id === model)?.input_modalities ?? null;
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
      provider: new OpenRouterMediaNotes(openRouter.client),
      transcriptionProvider: new OpenRouterTranscription(openRouter.client),
      chat: options.store.assistantChat,
      ledger: options.store.ledger,
      filesRoot: join(options.dataDirectory, 'assistant'),
      describeImages: (): boolean => options.store.assistantChat.settings().describe_images,
      inputModalities: (file) => modalitiesOf(options.store, file),
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
      clock: options.clock,
      log: options.log.forArea('hub.places'),
    }),
  };
}

export function contextOf(options: BuildOptions, live: LiveHub, statuses: Statuses): ServerContext {
  const log = options.log.forArea('hub.server');
  const computers = computerServicesOf(options, live);
  const outbound = outboundOf(options);
  const harness = harnessOf(options, live, outbound.openRouter);
  const assistant = assistantOf(options, live, computers.computerAi);
  assistant.attachLedger(options.store.ledger);
  assistant.attachMediaNotes(outbound.mediaNotes);
  const pushCommands = new PushCommandChannel();
  pushCommands.attachLive((clientId, notice) => live.deliver(clientId, notice));
  const preview = previewOf(options, live, { harness, access: computers.computerNodes, assistant });
  return {
    ...connectionContext(options),
    store: options.store,
    harness,
    preview,
    harnessSockets: harnessSocketsOf(options, computers.computerNodes, {
      harness,
      transport: { assistant, preview },
    }),
    imageRuntime: imagesOf(options, live, assistant, outbound.mediaNotes),
    ...computers,
    hub: options.core.hub,
    firewall: options.core.firewall,
    secrets: options.secrets,
    access: accessOf(options, live),
    links: new MediaLinks(options.clock.now),
    publicUrl: new PublicUrlVerifier({ store: options.store, fetch: options.fetch, log }),
    foodLookup: foodLookupOf(options, log),
    live,
    pushCommands,
    openCalls: new OpenCalls(),
    talk: talkOf(options, live),
    assistant,
    machineApprovals: machineApprovalsOf(options, pushCommands),
    watchActions: new WatchActionBroker(
      pushCommands,
      options.store,
      options.log.forArea('hub.watch'),
    ),
    watchData: new WatchDataService({ store: options.store, now: options.clock.now }),
    ...outbound,
    ...statuses,
    recordingPath: options.core.recordingPath,
    log,
  };
}

function machineApprovalsOf(options: BuildOptions, push: PushCommandChannel): MachineApprovals {
  return new MachineApprovals(push, options.store, options.log.forArea('hub.machine'));
}

function previewOf(
  options: BuildOptions,
  live: LiveHub,
  dependencies: {
    readonly harness: HarnessService;
    readonly access: ComputerNodeAccess;
    readonly assistant: ServerContext['assistant'];
  },
): PreviewService {
  const preview = new PreviewService(
    dependencies.harness,
    dependencies.access,
    options.log.forArea('hub.preview'),
    {
      assistant: dependencies.assistant,
      ...(options.preview === undefined ? {} : { config: options.preview }),
      notice: (notice): void => {
        live.profileNotice(notice, notice.profile_id, 'assistant');
      },
    },
  );
  live.previewOwners.attach(preview.leases);
  return preview;
}

function computerServicesOf(
  options: BuildOptions,
  live: LiveHub,
): Pick<ServerContext, 'computerAi' | 'computerNodes' | 'nodeSockets' | 'computerEars'> {
  const log = options.log.forArea('hub.computers');
  const computerAi = new ComputerAiDirectory(options.store, log);
  computerAi.onChange((status) => {
    live.announce({ type: 'computer_ai_status', status }, 'owners');
  });
  computerAi.onEvent(({ deviceId, event, profileId }) => {
    if (event.kind !== 'native') return;
    const notice = { type: 'computer_claude', device_id: deviceId, notice: event.notice } as const;
    if (profileId !== undefined) live.profileNotice(notice, profileId, 'owners');
    else live.announce(notice, 'owners');
  });
  computerAi.runtimes.onChange((status) => {
    live.announce({ type: 'computer_runtime_status', status }, 'owners');
  });
  computerAi.runtimes.onEvent(({ target, event, profileId }) => {
    if (event.kind !== 'native' || event.runtime !== 'codex') return;
    const notice = {
      type: 'computer_runtime_native',
      device_id: target.device_id,
      payload: { runtime: event.runtime, notice: event.notice },
    } as const;
    if (profileId !== undefined) live.profileNotice(notice, profileId, 'owners');
    else live.announce(notice, 'owners');
  });
  const computerNodes = new ComputerNodeAccess(options.store, options.clock.now);
  const nodeSockets = new ComputerNodeSockets(options.store, computerNodes, computerAi, log);
  return { computerAi, computerNodes, nodeSockets, computerEars: new EarsRelay() };
}

function harnessOf(
  options: BuildOptions,
  live: LiveHub,
  openRouter: ServerContext['openRouter'],
): HarnessService {
  const harness = new HarnessService(
    options.store,
    new HarnessRoutes(openRouter.catalogue, () => options.secrets.read().openrouterKey !== null),
    (event, profileId) => {
      live.profileNotice({ type: 'ai_harness', event }, profileId, 'assistant');
    },
    { dataDirectory: options.dataDirectory, clock: options.clock },
  );
  harness.configuration.onChange((notice) => {
    live.announce(notice, 'assistant');
  });
  return harness;
}

function imagesOf(
  options: BuildOptions,
  live: LiveHub,
  assistant: ServerContext['assistant'],
  notes: MediaNotes,
): ImageRuntime {
  return createImageRuntime({
    store: options.store,
    files: assistant.files,
    notes,
    fetch: options.fetch,
    key: () => options.secrets.read().openrouterKey,
    now: options.clock.now,
    publish: (receipt): void => {
      live.profileNotice({ type: 'image_operation', receipt }, receipt.profile_id, 'assistant');
    },
    preview: (preview): void => {
      live.profileNotice(preview, preview.profile_id, 'assistant');
    },
    log: options.log.forArea('hub.assistant'),
  });
}

function harnessSocketsOf(
  options: BuildOptions,
  access: ComputerNodeAccess,
  served: { readonly harness: HarnessService; readonly transport: HarnessTransportPorts },
): ComputerHarnessSockets {
  return new ComputerHarnessSockets(
    options.store,
    access,
    {
      service: served.harness,
      calls: (input) => harnessTransport(served.transport, served.harness, input),
    },
    options.log.forArea('hub.harness-socket'),
  );
}

function connectionContext(options: BuildOptions): Pick<ServerContext, 'connections'> {
  return options.connections === undefined ? {} : { connections: options.connections };
}

function foodLookupOf(options: BuildOptions, log: Logger): FoodLookup {
  return new FoodLookup({
    foods: options.store.foods,
    fetch: options.fetch,
    now: options.clock.now,
    version: options.version,
    log,
  });
}
