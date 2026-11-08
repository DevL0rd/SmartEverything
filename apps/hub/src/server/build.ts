import { chatFileRoutes } from '../browser/chat-files';
import { chatFileDeliveryRoutes } from '../self-update/chat-file';
import { nodeConnectionRoute } from './handlers/node-connection';
import { modelAssetRoutes, modelRouteServices } from './handlers/model-assets';
import { homeMapScanRoutesOf } from './handlers/home-map-scan';
import type { HubConnections } from '../network/connections';
import type { Server } from 'node:http';
import { startHubHarness } from './harness-wiring';
import { imageSpendCheck } from './image-authority';
import { harnessTransportRoutes } from '../harness/transport';
import { bindMeteredBudget } from '../harness/metered-accounting';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import type { Clock } from '../clock';
import type { RunningExtension, ServerExtension } from '../extensions';
import type { SecretStore } from '../secrets/store';
import type { LogLines } from '../service/log-lines';
import type { Core } from '../services';
import type { Store } from '../store/store';
import type { AccessService } from './access';
import { CameraSockets } from './camera-socket';
import type { ServerContext } from './context';
import { startBudget } from '../ledger/start-budget';
import type { Budget } from '../ledger/budget';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import { followBudget, startAssistantVoice } from '../assistant-voice/start';
import { hubVoiceMemory } from '../assistant-voice/voice-memory';
import type { RunningMemoryLearning } from '../memory/lifecycle';
import { RoomMedia } from '../reach/room-media';
import { homeCameras } from '../assistant-voice/home-cameras';
import { Reconciler } from '../ledger/reconciler';
import type { ClaudeService } from '../claude/service';
import { createToolHub } from '../ai-tools/create';
import { startSchedules, type Schedules } from '../schedules/start';
import { aiTurnsOf, attachAssistant } from './assistant-wiring';
import { attachAutomationAi } from './automation-ai-wiring';
import { attachAutomationIntegration } from './automation-integration-wiring';
import { attachAutomationTrace } from './automation-trace-attach';
import { startClaude } from './claude-wiring';
import { codexLocalFactory } from './codex-wiring';
import { hubCodexSites } from '../codex/sites';
import { startReach, type StartedReach } from './reach-wiring';
import { contextOf, statusOf } from './build-context';
import { extensionRoutes, routeTable, startExtensions } from './build-routes';
import { PluginSpeakers } from '../plugins/plugin-speakers';
import { startTranscribing, type Transcribing } from './transcribing';
import { wirePlugins, type Plugins } from './plugin-wiring';
import type { ToolHub } from '../ai-tools/tool-hub';
import { webhookRoutes } from './handlers/automation-webhooks';
import { computerMcpGrantRoute, computerMcpPolicyRoute } from './handlers/computer-mcp-grant';
import { createHttpServer, type RawRoute } from './http-server';
import { LiveHub } from './live';
import { Operations } from './operations';
import { Router } from './router';
import type { HubUpdateSourceRoutes } from './handlers/hub-update-source';
import { startWatchDriver } from './watch-driver-wiring';
import { startIrAppliances } from './ir-appliance-wiring';
import { startHomeMap } from '../home-map/home-map-hub';
import { seedModels } from './model-wiring';
import { starting } from './build-stop';
import { startRepair } from './repair-wiring';
import { startDriveHub, type RunningDriveHub } from './drive-hub';

export interface BuildOptions {
  readonly connections?: HubConnections;
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly core: Core;
  readonly layout: HubLayout;
  readonly hubUpdateSourceRoutes: HubUpdateSourceRoutes;
  readonly codex?: {
    readonly executable?: string;
    readonly controlSocket?: string;
  };
  readonly allowedOrigins: ReadonlySet<string>;
  readonly extensions: readonly ServerExtension[];
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  readonly version: string;
  readonly log: Logger;
  readonly logLines: LogLines;
  readonly alerts: OwnerAlerts;
}

export interface BuiltServer {
  readonly http: Server;
  readonly secure: Server | null;
  readonly context: ServerContext;
  readonly access: AccessService;
  readonly extensions: readonly RunningExtension[];
  readonly stop: () => Promise<void>;
}

export function followNetworkSettings(options: BuildOptions, context: ServerContext): () => void {
  return options.store.feed.subscribe((change) => {
    if (change.table !== 'settings' || change.record === null) {
      return;
    }
    options.core.supervisor
      .apply({ candidates: change.record.webrtc_candidates, iceServers: change.record.ice_servers })
      .then(
        () => {
          context.live.presence();
        },
        (cause: unknown) => {
          context.log.error('go2rtc.reconfigure_failed', cause);
        },
      );
  });
}

export interface Serving {
  readonly http: Server;
  readonly secure: Server | null;
  readonly cameraSockets: CameraSockets;
  readonly voice: AssistantVoice;
  readonly tools: ToolHub;
  readonly schedules: Schedules;
  readonly budget: Budget;
  readonly reconciler: Reconciler;
  readonly plugins: Plugins;
  readonly reach: StartedReach;
  readonly claude: ClaudeService;
  readonly transcribing: Transcribing;
  readonly detachTrace: () => void;
  readonly memory: RunningMemoryLearning;
  readonly stopRepair: () => void;
  readonly drive: RunningDriveHub;
}

interface StartedServing extends Omit<Serving, 'http' | 'secure' | 'drive'> {
  readonly rawRoutes: readonly RawRoute[];
}

function serve(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
  started: { readonly extensions: readonly RunningExtension[]; readonly drive: RunningDriveHub },
): Serving {
  const { extensions, drive } = started;
  const parts = servingParts(options, context, operations);
  const services = { ...parts, reach: parts.reach.routes, drive: drive.routes };
  const table = { ...routeTable(context, options, services), ...extensionRoutes(extensions) };
  operations.attach(table);
  const listeners = listenersOf(options, context, {
    extensions,
    routes: [...parts.rawRoutes, ...drive.rawRoutes],
    cameraSockets: parts.cameraSockets,
    assistantVoice: parts.voice,
    table,
  });
  parts.plugins.boot(listeners.http);
  return { ...parts, ...listeners, drive };
}

function servingParts(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
): StartedServing {
  const cameraSockets = new CameraSockets(options.log.forArea('hub.streams'));
  const tools = toolHubOf(options, context, operations);
  const memory = attachAssistant(context, tools, options.clock);
  const speakers = new PluginSpeakers();
  const voice = voiceOf(options, context, tools);
  const transcribing = startTranscribing(options, context, voice);
  const plugins = wirePlugins(options, context, tools, { speakers, voice: transcribing.plugins });
  const budget = budgetOf(options, context, voice);
  attachBudget(context, budget);
  const stopRepair = startRepair(context, options.layout);
  const reconciler = reconcilerOf(options, context);
  const schedules = startSchedules({ ...options, tools, ai: aiTurnsOf(context) });
  attachAutomationAi(context, tools, options);
  attachAutomationIntegration(context, tools, options);
  const detachTrace = attachAutomationTrace(context, options.clock.now);
  const reach = startReach(context, voice, options, { speakers, transcribing });
  const started = startClaude(context, options);
  registerCodexLocal(options, context);
  return {
    cameraSockets,
    tools,
    voice,
    transcribing,
    plugins,
    budget,
    reconciler,
    schedules,
    reach,
    claude: started.service,
    detachTrace,
    memory,
    stopRepair,
    rawRoutes: started.routes,
  };
}

function registerCodexLocal(options: BuildOptions, context: ServerContext): void {
  context.computerAi.runtimes.setLocalFactory(
    'codex',
    codexLocalFactory({
      sites: hubCodexSites(options.layout),
      log: options.log.forArea('hub.codex'),
      ...(options.codex ?? {}),
    }),
  );
}

function toolHubOf(options: BuildOptions, context: ServerContext, operations: Operations): ToolHub {
  return createToolHub({
    store: options.store,
    hub: options.core.hub,
    operations,
    layout: options.layout,
    clock: options.clock,
    mediaNotes: context.mediaNotes,
    log: options.log.forArea('hub.ai-tools'),
  });
}

function voiceOf(options: BuildOptions, context: ServerContext, tools: ToolHub): AssistantVoice {
  return startAssistantVoice({
    ...options,
    tools,
    memory: hubVoiceMemory(context),
    prices: context.openRouter.catalogue,
    openCalls: context.openCalls,
    cameras: homeCameras({ store: options.store, video: context.talk.camera.video }),
    roomMedia: new RoomMedia({
      store: options.store,
      enabled: () => options.store.assistantChat.settings().voice.pause_media_while_speaking,
      submit: options.core.hub.submit,
      log: options.log.forArea('hub.room-media'),
    }),
    now: options.clock.now,
    assistant: context.assistant,
    log: options.log.forArea('hub.voice'),
  });
}

function budgetOf(options: BuildOptions, context: ServerContext, voice: AssistantVoice): Budget {
  const budget = startBudget({
    store: options.store,
    openRouter: context.openRouter,
    alerts: options.alerts,
    note: (chatId, text) => {
      context.assistant.systemNote(chatId, text, 'Budget');
    },
    clock: options.clock,
    log: options.log.forArea('hub.budget'),
  });
  followBudget(voice, budget);
  return budget;
}

function reconcilerOf(options: BuildOptions, context: ServerContext): Reconciler {
  return new Reconciler({
    ledger: options.store.ledger,
    client: context.openRouter.client,
    sleep: options.clock.sleep,
    log: context.log,
  });
}

export function startClocks(context: ServerContext): void {
  context.access.lifecycle.start();
  context.weather.start();
  context.exchangeRates.start();
  context.openRouter.start();
  context.harness.skillUpdates.start();
}

function stopServing(served: Serving): void {
  served.stopRepair();
  served.detachTrace();
  served.memory.stop();
  served.reconciler.stop();
  served.budget.stop();
  served.reach.stop();
  served.transcribing.transcripts.stop();
  served.claude.stop();
}

function startHomeServices(context: ServerContext): () => void {
  seedModels(context.store);
  const stopIrAppliances = startIrAppliances(context);
  const stopHomeMap = startHomeMap(context);
  return (): void => {
    stopIrAppliances();
    stopHomeMap();
  };
}

export async function buildServer(options: BuildOptions): Promise<BuiltServer> {
  const status = statusOf(options);
  const context = contextOf(
    options,
    new LiveHub({
      store: options.store,
      status: status.status,
      log: options.log.forArea('hub.live'),
    }),
    status,
  );
  const stopWatches = startWatchDriver(context);
  const stopHomeServices = startHomeServices(context);
  await context.talk.start();
  context.assistant.start();
  const operations = new Operations(context.log, context.store);
  const extensions = await startExtensions(options, context, operations);
  const drive = await startDriveHub(options, context);
  const served = serve(options, context, operations, { extensions, drive });
  const harness = await startHubHarness(options, context, served.tools);
  if (harness !== null) context.assistant.attachHarness(context.harness, harness);
  const stop = starting(options, context, { harness, served, stopWatches, stopHomeServices });
  return {
    http: served.http,
    secure: served.secure,
    context,
    access: context.access,
    extensions: [...extensions, served.plugins.extension],
    stop,
  };
}

export function subscribeLive(options: BuildOptions, live: LiveHub): () => void {
  const unfollowFirewall = options.core.firewall.onChange((firewall) => {
    live.firewall(firewall);
  });
  const unfollowLog = options.logLines.listen((lines) => {
    live.announce({ type: 'service_log', lines: [...lines] }, 'service_log');
  });
  return (): void => {
    unfollowFirewall();
    unfollowLog();
  };
}

function rawRoutesOf(
  extensions: readonly RunningExtension[],
  routes: readonly RawRoute[],
  context: ServerContext,
  fetcher: typeof fetch,
): readonly RawRoute[] {
  return [
    ...extensions.flatMap((extension) => extension.routes),
    ...routes,
    ...chatFileRoutes(context.store, context.assistant.projects),
    computerMcpGrantRoute(context),
    computerMcpGrantRoute(context, true),
    computerMcpPolicyRoute(context),
    ...webhookRoutes(context.hub.automationWebhooks),
    nodeConnectionRoute(context),
    ...modelAssetRoutes(modelRouteServices(context.store)),
    ...harnessTransportRoutes(context, context.harness, fetcher),
  ];
}
export function stopComputersAndServing(context: ServerContext, served: Serving): void {
  context.access.lifecycle.stop();
  context.harnessSockets.stop();
  context.nodeSockets.stop();
  context.computerAi.stop();
  context.machineApprovals.stop();
  stopServing(served);
}

function attachBudget(context: ServerContext, budget: Budget): void {
  bindMeteredBudget(context.store, budget.gate);
  context.assistant.delegation.attachGate(budget.gate);
  context.imageRuntime.bindSpend(imageSpendCheck(budget.gate));
}

interface ListenerParts {
  readonly extensions: readonly RunningExtension[];
  readonly routes: readonly RawRoute[];
  readonly cameraSockets: CameraSockets;
  readonly assistantVoice: AssistantVoice;
  readonly table: ConstructorParameters<typeof Router>[0];
}

function listenersOf(
  options: BuildOptions,
  context: ServerContext,
  parts: ListenerParts,
): Pick<Serving, 'http' | 'secure'> {
  const httpOptions = {
    context,
    router: new Router(parts.table, options.store, context.log),
    rawRoutes: [
      ...rawRoutesOf(parts.extensions, parts.routes, context, options.fetch),
      ...chatFileDeliveryRoutes(options.layout),
      ...homeMapScanRoutesOf(options, context),
    ],
    allowedOrigins: options.allowedOrigins,
    cameraSockets: parts.cameraSockets,
    assistantVoice: parts.assistantVoice,
    go2rtc: options.core.go2rtc,
  };
  const http = createHttpServer(httpOptions);
  const secure =
    options.connections === undefined
      ? null
      : createHttpServer(httpOptions, {
          key: options.connections.tls.key,
          cert: options.connections.tls.cert,
          minVersion: 'TLSv1.2',
        });
  return { http, secure };
}

export async function stopAssistantServices(context: ServerContext): Promise<void> {
  await context.harness.skillUpdates.stop();
  context.assistant.stop();
  await context.imageRuntime.stop();
  context.browser.stop();
}
