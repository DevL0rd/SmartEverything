import { deviceEffectRoutes } from './handlers/device-effects';
import { deviceGroupRoutes } from './handlers/device-groups';
import { aiReferenceRoutes } from './handlers/ai-references';
import { aiProjectRoutes } from './handlers/ai-projects';
import { memoryRoutes } from '../memory/routes';
import { hubMemoryOf } from '../memory/hub-memory';
import { keepHubUpdate, recoverHubUpdate, rollbackHubUpdate } from '../self-update/execute';
import { hubUpdateStatus } from '../self-update/recovery';
import { embeddedBrowserRoutes } from './handlers/embedded-browser';
import { imageRoutes } from './handlers/images';
import { aiAgentRunRoutes } from './handlers/ai-agent-runs';
import { aiHarnessRoutes } from './handlers/ai-harness';
import { foldSessionInfo } from '@smarteverything/harness';
import { sessionInfoRoutes } from '../harness/session-info-routes';
import { DeliverableProjector, workspaceRoutes } from '../harness/workspace-routes';
import { outputAuthority } from '../assistant/turn-authority';
import { computerRuntimeRoutes } from '../computers/runtime-routes';
import { computerAiRoutes } from '../computers/ai-routes';
import { computerNodeRoutes } from '../computers/node-routes';
import type { HubLayout } from '../data-layout';
import type { RunningExtension } from '../extensions';
import { aiModelRoutes } from '../openrouter/routes';
import { SecretApiKeyVault } from '../harness/api-key-vault';
import { deepSeekRoutes } from '../harness/deepseek-routes';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { ClaudeService } from '../claude/service';
import type { Budget } from '../ledger/budget';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Schedules } from '../schedules/start';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { accessRoutes } from './handlers/access';
import { appViewRoutes } from './handlers/app-view';
import { aiBudgetRoutes } from './handlers/ai-budget';
import { nativeCommandRoutes } from './handlers/ai-native-commands';
import { aiProviderRoutes } from './handlers/ai-provider';
import { aiChatRoutes } from './handlers/ai-chats';
import { aiCoordinationRoutes } from './handlers/ai-coordination';
import { claudeCliRoutes } from './handlers/claude-cli';
import { claudeRoutes } from './handlers/claude';
import { aiUsageRoutes } from './handlers/ai-usage';
import { assistantChatRoutes } from './handlers/assistant';
import { assistantVoiceRoutes } from './handlers/assistant-voice';
import { automationRoutes } from './automation-wiring';
import { callRoutes } from './handlers/calls';
import { deviceLogRoutes } from './handlers/device-log';
import { runtimeLogRoutes } from './handlers/runtime-logs';
import { aiRepairRoutes } from './handlers/ai-repair';
import { selfUpdateRecoveryRoutes } from './handlers/self-update-recovery';
import { deviceRoutes } from './handlers/devices';
import { firewallRoutes } from './handlers/firewall';
import { assistantRoutes, healthRoutes } from './handlers/health';
import { mediaRoutes } from './handlers/media';
import { nutritionRoutes } from './handlers/nutrition';
import { peopleRoutes } from './handlers/people';
import { placeRoutes } from './handlers/places';
import { googleRoutes } from './handlers/google';
import { plannerRoutes } from './build-planner-routes';
import { startPlanner } from './planner-wiring';
import { automationEntityOptionsRoutes } from './handlers/automation-entity-options';
import { pluginRoutes } from './handlers/plugins';
import { scheduleRoutes } from './handlers/schedules';
import { settingsRoutes } from './handlers/settings';
import { televisionRoutes } from './handlers/television';
import { televisionFindRoutes } from './handlers/television-find';
import { vacuumRoutes } from './handlers/vacuums';
import { homeMapRoutes } from './handlers/home-map';
import { homeMapSetRoutes } from './handlers/home-map-set';
import { modelRouteServices } from './handlers/model-assets';
import { modelRoutes } from './handlers/models';
import { transcriptRoutes } from './handlers/transcripts';
import { signalRoutes } from './handlers/signals';
import { snapshotRoutes } from './handlers/snapshot';
import { talkRoutes } from './handlers/talk';
import { watchRoutes } from './handlers/watches';
import { developerRoutes } from './handlers/developer';
import { weatherRoutes } from './handlers/weather';
import { exchangeRatesRoutes } from './handlers/exchange-rates';
import type { Operations } from './operations';
import type { Plugins } from './plugin-wiring';
import type { Transcribing } from './transcribing';
import type { ListeningRoutes } from './handlers/listening';
import type { ReachRoutes } from './handlers/reach';
import type { RunningDriveHub } from './drive-hub';
import type { ExtensionRouteTable, RouteTable } from './router';

export interface RouteServices {
  readonly voice: AssistantVoice;
  readonly budget: Budget;
  readonly schedules: Schedules;
  readonly plugins: Plugins;
  readonly reach: ReachRoutes & ListeningRoutes;
  readonly claude: ClaudeService;
  readonly transcribing: Transcribing;
  readonly tools: ToolHub;
  readonly drive: RunningDriveHub['routes'];
}

const aiConversationRoutes = (context: ServerContext, layout: HubLayout) =>
  ({
    ...assistantChatRoutes(context),
    ...aiChatRoutes(context),
    ...selfUpdateRecoveryRoutes({
      status: () => hubUpdateStatus(layout),
      recover: (runId, holdSeconds) => recoverHubUpdate(layout, runId, holdSeconds),
      rollback: (runId) => rollbackHubUpdate(layout, runId),
      keep: (runId) => keepHubUpdate(layout, runId),
    }),
    ...aiHarnessRoutes(context.harness),
    ...aiAgentRunRoutes(context.store, (run, body, sender) =>
      context.assistant.controlAgentRun(run, body, sender),
    ),
    ...aiCoordinationRoutes(context),
    ...workspaceRoutes(
      context.harness,
      new DeliverableProjector({
        fromOutFile: context.assistant.files.fromOutFile.bind(context.assistant.files),
        authorize: (chatId): (() => void) => outputAuthority(context.store, chatId),
      }),
    ),
    ...sessionInfoRoutes(context.harness, foldSessionInfo),
    ...deepSeekRoutes(new SecretApiKeyVault(context.secrets)),
  }) as const;

function hubMemoryRoutes(context: ServerContext): ReturnType<typeof memoryRoutes> {
  return memoryRoutes(hubMemoryOf(context).service);
}

function assistantConversationRoutes(
  context: ServerContext,
  now: BuildOptions['clock']['now'],
  layout: HubLayout,
): Pick<
  RouteTable,
  | keyof ReturnType<typeof runtimeLogRoutes>
  | keyof ReturnType<typeof aiRepairRoutes>
  | keyof ReturnType<typeof assistantMediaRoutes>
  | keyof ReturnType<typeof aiConversationRoutes>
  | keyof ReturnType<typeof hubMemoryRoutes>
> {
  return {
    ...runtimeLogRoutes(context, now),
    ...aiRepairRoutes(context.store, context.logs, layout, context.assistant.repair),
    ...assistantMediaRoutes(context),
    ...aiConversationRoutes(context, layout),
    ...hubMemoryRoutes(context),
  };
}

export function routeTable(
  context: ServerContext,
  options: Pick<
    BuildOptions,
    'clock' | 'core' | 'layout' | 'hubUpdateSourceRoutes' | 'fetch' | 'version'
  >,
  services: RouteServices,
): RouteTable {
  return {
    ...assistantConversationRoutes(context, options.clock.now, options.layout),
    ...options.hubUpdateSourceRoutes,
    ...assistantVoiceRoutes(context, services.voice, services.budget.gate),
    ...callRoutes(services.voice),
    ...liveLinkRoutes(context, services.reach),
    ...claudeSessionRoutes(services.claude),
    ...computerAiRoutes(context.computerAi),
    ...computerRuntimeRoutes(context.computerAi, context.store),
    ...computerNodeRoutes(context),
    ...transcriptRoutes(
      context.store,
      services.transcribing.transcripts,
      services.transcribing.listening,
    ),
    ...pluginRoutes(context.store, services.plugins.admin),
    ...automationEntityOptionsRoutes(context, services.plugins.admin),
    ...snapshotRoutes(context, options.clock.now),
    ...accessRoutes(context),
    ...settingsRoutes(context, options.clock.now),
    ...allDeviceRoutes(context),
    ...mediaRoutes(context),
    ...firewallRoutes(context),
    ...automationRoutes(context, services.tools),
    ...healthRoutes(context),
    ...assistantRoutes(context),
    ...peopleRoutes(context),
    ...nutritionRoutes(context),
    ...watchRoutes(context),
    ...developerRoutes(context),
    ...weatherRoutes(context, options.clock.now),
    ...exchangeRatesRoutes(context, options.clock.now),
    ...placeRoutes(context),
    ...featureRoutes(context, options, services.drive),
    ...talkRoutes(context),
    ...scheduleRoutes(context.store, services.schedules),
    ...signalRoutes(context),
    ...nativeChatProviderRoutes(context),
    ...aiSpendRoutes(context, services.budget),
    ...aiModelRoutes(context),
  };
}

function featureRoutes(
  context: ServerContext,
  options: Pick<BuildOptions, 'clock' | 'core' | 'fetch' | 'version'>,
  drive: RouteServices['drive'],
): ReturnType<typeof plannerRoutes> & ReturnType<typeof googleRoutes> & RouteServices['drive'] {
  return {
    ...plannerRoutes(context, options),
    ...googleRoutes(context, options.core.google),
    ...drive,
  };
}

function liveLinkRoutes(
  context: ServerContext,
  reach: RouteServices['reach'],
): RouteServices['reach'] & ReturnType<typeof appViewRoutes> {
  return {
    ...reach,
    ...appViewRoutes({
      broker: context.live.appViews,
      store: context.store,
      foreground: () => context.live.connectedClients(),
    }),
  };
}

function allDeviceRoutes(
  context: ServerContext,
): Pick<
  RouteTable,
  | keyof ReturnType<typeof deviceRoutes>
  | keyof ReturnType<typeof deviceLogRoutes>
  | keyof ReturnType<typeof deviceGroupRoutes>
  | keyof ReturnType<typeof deviceEffectRoutes>
  | keyof ReturnType<typeof televisionRoutes>
  | keyof ReturnType<typeof televisionFindRoutes>
  | keyof ReturnType<typeof vacuumRoutes>
  | keyof ReturnType<typeof modelRoutes>
  | keyof ReturnType<typeof homeMapRoutes>
  | keyof ReturnType<typeof homeMapSetRoutes>
> {
  return {
    ...deviceRoutes(context),
    ...vacuumRoutes(context.hub.vacuums),
    ...modelRoutes(modelRouteServices(context.store)),
    ...homeMapRoutes(context),
    ...homeMapSetRoutes(context),
    ...televisionRoutes(context),
    ...televisionFindRoutes(context),
    ...deviceLogRoutes(context),
    ...deviceGroupRoutes(context),
    ...deviceEffectRoutes(context),
  };
}

function aiSpendRoutes(
  context: ServerContext,
  budget: Budget,
): Pick<
  RouteTable,
  keyof ReturnType<typeof aiUsageRoutes> | keyof ReturnType<typeof aiBudgetRoutes>
> {
  return { ...aiUsageRoutes(context), ...aiBudgetRoutes(budget) };
}

function nativeChatProviderRoutes(
  context: ServerContext,
): Pick<
  RouteTable,
  keyof ReturnType<typeof aiProviderRoutes> | keyof ReturnType<typeof nativeCommandRoutes>
> {
  return { ...aiProviderRoutes(context), ...nativeCommandRoutes(context) };
}

function claudeSessionRoutes(
  service: ClaudeService,
): Pick<RouteTable, keyof ReturnType<typeof claudeRoutes> | keyof typeof claudeCliRoutes> {
  return { ...claudeRoutes(service), ...claudeCliRoutes };
}

function assistantMediaRoutes(
  context: ServerContext,
): Pick<
  RouteTable,
  | keyof ReturnType<typeof imageApiRoutes>
  | keyof ReturnType<typeof embeddedBrowserRoutes>
  | keyof ReturnType<typeof aiProjectRoutes>
  | keyof ReturnType<typeof aiReferenceRoutes>
> {
  return {
    ...imageApiRoutes(context),
    ...embeddedBrowserRoutes(context.browser),
    ...aiProjectRoutes(context.store, context.assistant.projects),
    ...aiReferenceRoutes(context.assistant.references),
  };
}

export function extensionRoutes(extensions: readonly RunningExtension[]): ExtensionRouteTable {
  return extensions.reduce<ExtensionRouteTable>(
    (table, extension) => ({ ...table, ...extension.endpoints }),
    {},
  );
}

export async function startExtensions(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
): Promise<RunningExtension[]> {
  const running = await Promise.all(
    options.extensions.map((extension) =>
      extension({
        store: options.store,
        computerAi: context.computerAi,
        computerEars: context.computerEars,
        computerPlacements: context.computerPlacements,
        nodeSockets: context.nodeSockets,
        hub: options.core.hub,
        secrets: options.secrets,
        live: context.live,
        pushCommands: context.pushCommands,
        replyNotices: context.replyNotices,
        machineApprovals: context.machineApprovals,
        openCalls: context.openCalls,
        mediaNotes: context.mediaNotes,
        calendars: options.core.planner.calendars,
        links: context.links,
        operations,
        publications: context.publications,
        layout: options.layout,
        log: options.log.forArea('hub.extension'),
      }),
    ),
  );
  return [...running, startPlanner(options.core, context, options.alerts, options.clock.now)];
}

function imageApiRoutes(context: ServerContext): ReturnType<typeof imageRoutes> {
  return imageRoutes({
    images: context.imageRuntime.service,
    imageActor: context.imageRuntime.actor,
    imageCatalog: context.imageRuntime.readCatalog,
    selectedImageModel: () => context.store.assistantChat.settings().image_model,
  });
}
