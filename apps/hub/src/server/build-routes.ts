import { aiReferenceRoutes } from './handlers/ai-references';
import { aiProjectRoutes } from './handlers/ai-projects';
import { aiPreviewRoutes } from './handlers/ai-previews';
import { imageRoutes } from './handlers/images';
import { aiAgentRunRoutes } from './handlers/ai-agent-runs';
import { aiHarnessRoutes } from './handlers/ai-harness';
import { computerRuntimeRoutes } from '../computers/runtime-routes';
import { computerAiRoutes } from '../computers/ai-routes';
import { computerNodeRoutes } from '../computers/node-routes';
import type { RunningExtension } from '../extensions';
import { aiModelRoutes } from '../openrouter/routes';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { ClaudeService } from '../claude/service';
import type { Budget } from '../ledger/budget';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Schedules } from '../schedules/start';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { accessRoutes } from './handlers/access';
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
import { automationRoutes, sceneRoutes } from './handlers/automation';
import { callRoutes } from './handlers/calls';
import { deviceRoutes } from './handlers/devices';
import { firewallRoutes } from './handlers/firewall';
import { assistantRoutes, healthRoutes } from './handlers/health';
import { mediaRoutes } from './handlers/media';
import { nutritionRoutes } from './handlers/nutrition';
import { peopleRoutes } from './handlers/people';
import { placeRoutes } from './handlers/places';
import { pluginRoutes } from './handlers/plugins';
import { scheduleRoutes } from './handlers/schedules';
import { settingsRoutes } from './handlers/settings';
import { transcriptRoutes } from './handlers/transcripts';
import { signalRoutes } from './handlers/signals';
import { snapshotRoutes } from './handlers/snapshot';
import { talkRoutes } from './handlers/talk';
import { watchRoutes } from './handlers/watches';
import { weatherRoutes } from './handlers/weather';
import { exchangeRatesRoutes } from './handlers/exchange-rates';
import type { Operations } from './operations';
import type { Plugins } from './plugin-wiring';
import type { Transcribing } from './transcribing';
import type { ReachRoutes } from './handlers/reach';
import type { ExtensionRouteTable, RouteTable } from './router';

export interface RouteServices {
  readonly voice: AssistantVoice;
  readonly budget: Budget;
  readonly schedules: Schedules;
  readonly plugins: Plugins;
  readonly reach: ReachRoutes;
  readonly claude: ClaudeService;
  readonly transcribing: Transcribing;
  readonly tools: ToolHub;
}

export function routeTable(
  context: ServerContext,
  now: () => Date,
  services: RouteServices,
): RouteTable {
  return {
    ...assistantMediaRoutes(context),
    ...aiHarnessRoutes(context.harness),
    ...assistantVoiceRoutes(services.voice),
    ...callRoutes(context, services.voice),
    ...services.reach,
    ...claudeSessionRoutes(context, services.claude),
    ...computerAiRoutes(context.computerAi),
    ...computerRuntimeRoutes(context.computerAi, context.store),
    ...computerNodeRoutes(context.computerNodes, context.nodeSockets, context.harnessSockets),
    ...transcriptRoutes(
      context.store,
      services.transcribing.transcripts,
      services.transcribing.listening,
    ),
    ...pluginRoutes(context.store, services.plugins.admin),
    ...snapshotRoutes(context, now),
    ...accessRoutes(context),
    ...settingsRoutes(context),
    ...deviceRoutes(context),
    ...mediaRoutes(context),
    ...firewallRoutes(context),
    ...sceneRoutes(context),
    ...automationRoutes(context, services.tools),
    ...healthRoutes(context),
    ...assistantRoutes(context),
    ...peopleRoutes(context),
    ...nutritionRoutes(context),
    ...watchRoutes(context),
    ...weatherRoutes(context, now),
    ...exchangeRatesRoutes(context, now),
    ...placeRoutes(context),
    ...talkRoutes(context),
    ...scheduleRoutes(context.store, services.schedules),
    ...signalRoutes(context),
    ...assistantChatRoutes(context),
    ...aiChatRoutes(context),
    ...nativeChatProviderRoutes(context),
    ...aiAgentRunRoutes(context.store, (run, body) => context.assistant.controlAgentRun(run, body)),
    ...aiCoordinationRoutes(context),
    ...aiUsageRoutes(context),
    ...aiBudgetRoutes(services.budget),
    ...aiModelRoutes(context),
  };
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
  context: ServerContext,
  service: ClaudeService,
): Pick<
  RouteTable,
  keyof ReturnType<typeof claudeRoutes> | keyof ReturnType<typeof claudeCliRoutes>
> {
  return { ...claudeRoutes(service), ...claudeCliRoutes(context) };
}

function assistantMediaRoutes(
  context: ServerContext,
): Pick<
  RouteTable,
  | keyof ReturnType<typeof imageApiRoutes>
  | keyof ReturnType<typeof aiPreviewRoutes>
  | keyof ReturnType<typeof aiProjectRoutes>
  | keyof ReturnType<typeof aiReferenceRoutes>
> {
  return {
    ...imageApiRoutes(context),
    ...aiPreviewRoutes(context.preview),
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

export function startExtensions(
  options: BuildOptions,
  context: ServerContext,
  operations: Operations,
): Promise<RunningExtension[]> {
  return Promise.all(
    options.extensions.map((extension) =>
      extension({
        store: options.store,
        computerAi: context.computerAi,
        hub: options.core.hub,
        secrets: options.secrets,
        live: context.live,
        pushCommands: context.pushCommands,
        openCalls: context.openCalls,
        mediaNotes: context.mediaNotes,
        operations,
        dataDirectory: options.dataDirectory,
        log: options.log.forArea('hub.extension'),
      }),
    ),
  );
}

function imageApiRoutes(context: ServerContext): ReturnType<typeof imageRoutes> {
  return imageRoutes({
    images: context.imageRuntime.service,
    imageActor: context.imageRuntime.actor,
    imageCatalog: context.imageRuntime.readCatalog,
  });
}
