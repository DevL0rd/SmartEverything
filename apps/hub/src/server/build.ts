import { nativeHtmlClaimRoute, nativeProjectAssetRoutes } from '../preview/native-html';
import { nodeConnectionRoute } from './handlers/node-connection';
import type { HubConnections } from '../network/connections';
import type { PreviewGatewayConfig } from '../preview/gateway';
import type { Server } from 'node:http';
import { startHubHarness } from './harness-wiring';
import { harnessTransportRoutes } from '../harness/transport';
import { bindMeteredBudget } from '../harness/metered-accounting';
import type { Logger } from '@smarteverything/logging';
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
import { homeCameras } from '../assistant-voice/home-cameras';
import { Reconciler } from '../ledger/reconciler';
import type { ClaudeService } from '../claude/service';
import { createToolHub } from '../ai-tools/create';
import { startSchedules, type Schedules } from '../schedules/start';
import { aiTurnsOf, attachAssistant } from './assistant-wiring';
import { attachAutomationAi } from './automation-ai-wiring';
import { startClaude } from './claude-wiring';
import { codexLocalFactory } from './codex-wiring';
import { startReach, type StartedReach } from './reach-wiring';
import { contextOf, statusOf } from './build-context';
import { extensionRoutes, routeTable, startExtensions } from './build-routes';
import { PluginSpeakers } from '../plugins/plugin-reach';
import { startTranscribing, type Transcribing } from './transcribing';
import { wirePlugins, type Plugins } from './plugin-wiring';
import type { ToolHub } from '../ai-tools/tool-hub';
import { computerMcpGrantRoute, computerMcpPolicyRoute } from './handlers/computer-mcp-grant';
import { createHttpServer, type RawRoute } from './http-server';
import { LiveHub } from './live';
import { Operations } from './operations';
import { Router } from './router';

export interface BuildOptions {
  readonly connections?: HubConnections;
  readonly preview?: PreviewGatewayConfig;
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly core: Core;
  readonly dataDirectory: string;
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

function followNetworkSettings(options: BuildOptions, context: ServerContext): () => void {
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

interface Serving {
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
}

interface StartedServing extends Omit<Serving, 'http' | 'secure'> {
  readonly rawRoutes: readonly RawRoute[];
}

function serve(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
  extensions: readonly RunningExtension[],
): Serving {
  const parts = servingParts(options, context, operations);
  const table = {
    ...routeTable(context, options.clock.now, { ...parts, reach: parts.reach.routes }),
    ...extensionRoutes(extensions),
  };
  operations.attach(table);
  const listeners = listenersOf(options, context, {
    extensions,
    routes: parts.rawRoutes,
    cameraSockets: parts.cameraSockets,
    assistantVoice: parts.voice,
    table,
  });
  parts.plugins.boot(listeners.http);
  return { ...parts, ...listeners };
}

function servingParts(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
): StartedServing {
  const cameraSockets = new CameraSockets(options.log.forArea('hub.streams'));
  const tools = toolHubOf(options, context, operations);
  attachAssistant(context, tools);
  const speakers = new PluginSpeakers();
  const voice = voiceOf(options, context, tools);
  const transcribing = startTranscribing(options, context, voice);
  const plugins = wirePlugins(options, context, tools, { speakers, voice: transcribing.plugins });
  const budget = budgetOf(options, context, voice);
  attachBudget(context, budget);
  const reconciler = reconcilerOf(options, context);
  const schedules = startSchedules({ ...options, tools, ai: aiTurnsOf(context) });
  attachAutomationAi(context, tools, options);
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
    rawRoutes: started.routes,
  };
}

function registerCodexLocal(options: BuildOptions, context: ServerContext): void {
  context.computerAi.runtimes.setLocalFactory(
    'codex',
    codexLocalFactory({
      dataDirectory: options.dataDirectory,
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
    dataDirectory: options.dataDirectory,
    clock: options.clock,
    mediaNotes: context.mediaNotes,
    log: options.log.forArea('hub.ai-tools'),
  });
}

function voiceOf(options: BuildOptions, context: ServerContext, tools: ToolHub): AssistantVoice {
  return startAssistantVoice({
    ...options,
    tools,
    prices: context.openRouter.catalogue,
    openCalls: context.openCalls,
    cameras: homeCameras({ store: options.store, video: context.talk.camera.video }),
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

function stopServing(served: Serving): void {
  served.reconciler.stop();
  served.budget.stop();
  served.reach.stop();
  served.transcribing.transcripts.stop();
  served.claude.stop();
}

export async function buildServer(options: BuildOptions): Promise<BuiltServer> {
  const status = statusOf(options);
  const live = new LiveHub({
    store: options.store,
    status: status.status,
    log: options.log.forArea('hub.live'),
  });
  const context = contextOf(options, live, status);
  await context.preview.gateway.start();
  await context.talk.start();
  context.assistant.start();
  const operations = new Operations(context.log);
  const extensions = await startExtensions(options, context, operations);
  const served = serve(options, context, operations, extensions);
  const harness = await startHubHarness(options, context, served.tools, operations);
  if (harness !== null) context.assistant.attachHarness(context.harness, harness);
  const { http, secure, cameraSockets, voice, schedules } = served;
  const unsubscribe = followNetworkSettings(options, context);
  context.weather.start();
  context.exchangeRates.start();
  context.openRouter.start();
  context.harness.skillUpdates.start();
  const unfollowLive = subscribeLive(options, live);
  return {
    http,
    secure,
    context,
    access: context.access,
    extensions: [...extensions, served.plugins.extension],
    stop: async (): Promise<void> => {
      await stopAssistantServices(context);
      await harness?.dispose();
      unsubscribe();
      unfollowLive();
      live.stop();
      context.watchActions.stop();
      context.talk.stop();
      context.weather.stop();
      context.exchangeRates.stop();
      stopComputersAndServing(context, served);
      context.openRouter.stop();
      cameraSockets.stop();
      schedules.scheduler.stop();
      voice.stop().catch((cause: unknown) => {
        context.log.error('voice.stop_failed', cause);
      });
    },
  };
}

function subscribeLive(options: BuildOptions, live: LiveHub): () => void {
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
    nativeHtmlClaimRoute(context.store, context.preview),
    ...nativeProjectAssetRoutes(context.store, context.preview),
    computerMcpGrantRoute(context),
    computerMcpGrantRoute(context, true),
    computerMcpPolicyRoute(context),
    nodeConnectionRoute(context),
    ...harnessTransportRoutes(context, context.harness, fetcher),
  ];
}
function stopComputersAndServing(context: ServerContext, served: Serving): void {
  context.harnessSockets.stop();
  context.nodeSockets.stop();
  context.computerAi.stop();
  stopServing(served);
}

function attachBudget(context: ServerContext, budget: Budget): void {
  bindMeteredBudget(context.store, budget.gate);
  context.assistant.coordination.attachGate(budget.gate);
  context.imageRuntime.bindSpend((background): void => {
    budget.gate.check('image', background ? { background: true } : undefined);
  });
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
    rawRoutes: rawRoutesOf(parts.extensions, parts.routes, context, options.fetch),
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

async function stopAssistantServices(context: ServerContext): Promise<void> {
  await context.harness.skillUpdates.stop();
  context.assistant.stop();
  await context.imageRuntime.stop();
  await context.preview.stop();
}
