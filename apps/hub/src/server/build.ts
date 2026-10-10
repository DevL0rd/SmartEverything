import type { Server } from 'node:http';
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
import { startAssistantVoice } from '../assistant-voice/start';
import { Reconciler } from '../ledger/reconciler';
import { createToolHub } from '../ai-tools/create';
import { startChatWidgets } from '../chat-widgets/start';
import { startSchedules, type Schedules } from '../schedules/start';
import { aiTurnsOf, attachAssistant, type Listening } from './assistant-wiring';
import { attachAutomationAi } from './automation-ai-wiring';
import { startReach, type StartedReach } from './reach-wiring';
import { contextOf, statusOf } from './build-context';
import { extensionRoutes, routeTable, startExtensions } from './build-routes';
import { wirePlugins, type Plugins } from './plugin-wiring';
import type { ToolHub } from '../ai-tools/tool-hub';
import { createHttpServer } from './http-server';
import { LiveHub } from './live';
import { Operations } from './operations';
import { Router } from './router';

export interface BuildOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly core: Core;
  readonly dataDirectory: string;
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
  readonly context: ServerContext;
  readonly access: AccessService;
  readonly extensions: readonly RunningExtension[];
  readonly stop: () => void;
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
  readonly cameraSockets: CameraSockets;
  readonly voice: AssistantVoice;
  readonly tools: ToolHub;
  readonly schedules: Schedules;
  readonly budget: Budget;
  readonly reconciler: Reconciler;
  readonly plugins: Plugins;
  readonly stopWidgets: () => void;
  readonly reach: StartedReach;
}

function serve(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
  extensions: readonly RunningExtension[],
): Serving {
  const cameraSockets = new CameraSockets(options.log.forArea('hub.streams'));
  const tools = createToolHub({
    store: options.store,
    hub: options.core.hub,
    operations,
    dataDirectory: options.dataDirectory,
    clock: options.clock,
    log: options.log.forArea('hub.ai-tools'),
  });
  attachAssistant(options, context, tools);
  const stopWidgets = startChatWidgets({ ...options, context, tools });
  const plugins = wirePlugins(options, context, tools);
  const voice = voiceOf(options, context, tools);
  const budget = budgetOf(options, context);
  context.assistant.coordination.attachGate(budget.gate);
  const reconciler = reconcilerOf(options, context);
  const schedules = startSchedules({ ...options, tools, ai: aiTurnsOf(context) });
  attachAutomationAi(context, tools, options);
  const reach = startReach(context, voice, options);
  const routes = { voice, schedules, budget, plugins, reach: reach.routes };
  const table = {
    ...routeTable(context, options.clock.now, routes),
    ...extensionRoutes(extensions),
  };
  operations.attach(table);
  const http = createHttpServer({
    context,
    router: new Router(table, options.store, context.log),
    rawRoutes: extensions.flatMap((extension) => extension.routes),
    allowedOrigins: options.allowedOrigins,
    cameraSockets,
    assistantVoice: voice,
    go2rtc: options.core.go2rtc,
  });
  plugins.boot(http);
  const parts = { http, cameraSockets, voice, tools, schedules, budget, reconciler, plugins };
  return { ...parts, stopWidgets, reach };
}

function voiceOf(options: BuildOptions, context: ServerContext, tools: ToolHub): AssistantVoice {
  return startAssistantVoice({
    ...options,
    tools,
    prices: context.openRouter.catalogue,
    now: options.clock.now,
    assistant: context.assistant,
    log: options.log.forArea('hub.voice'),
  });
}

function budgetOf(options: BuildOptions, context: ServerContext): Budget {
  return startBudget({
    store: options.store,
    openRouter: context.openRouter,
    alerts: options.alerts,
    note: (chatId, text) => {
      context.assistant.systemNote(chatId, text, 'Budget');
    },
    clock: options.clock,
    log: options.log.forArea('hub.budget'),
  });
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
  served.stopWidgets();
  served.reach.stop();
}

export async function buildServer(options: BuildOptions): Promise<BuiltServer> {
  const status = statusOf(options);
  const live = new LiveHub({
    store: options.store,
    status: status.status,
    log: options.log.forArea('hub.live'),
  });
  const listening: Listening = { server: null };
  const context = contextOf(options, live, status, listening);
  await context.talk.start();
  await context.assistant.start();
  const operations = new Operations(context.log);
  const extensions = await startExtensions(options, context, operations);
  const served = serve(options, context, operations, extensions);
  const { http, cameraSockets, voice, schedules } = served;
  listening.server = http;
  const unsubscribe = followNetworkSettings(options, context);
  context.weather.start();
  context.openRouter.start();
  const unfollowFirewall = options.core.firewall.onChange((firewall) => {
    live.firewall(firewall);
  });
  const unfollowLog = options.logLines.listen((lines) => {
    live.announce({ type: 'service_log', lines: [...lines] }, 'service_log');
  });
  return {
    http,
    context,
    access: context.access,
    extensions: [...extensions, served.plugins.extension],
    stop: (): void => {
      unsubscribe();
      unfollowFirewall();
      unfollowLog();
      live.stop();
      context.watchActions.stop();
      context.talk.stop();
      context.assistant.stop();
      context.weather.stop();
      stopServing(served);
      context.openRouter.stop();
      cameraSockets.stop();
      schedules.scheduler.stop();
      voice.stop().catch((cause: unknown) => {
        context.log.error('voice.stop_failed', cause);
      });
    },
  };
}
