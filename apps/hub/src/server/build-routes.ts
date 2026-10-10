import type { RunningExtension } from '../extensions';
import { aiModelRoutes } from '../openrouter/routes';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { Budget } from '../ledger/budget';
import type { Schedules } from '../schedules/start';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { accessRoutes } from './handlers/access';
import { aiBudgetRoutes } from './handlers/ai-budget';
import { aiChatRoutes } from './handlers/ai-chats';
import { aiCoordinationRoutes } from './handlers/ai-coordination';
import { aiUsageRoutes } from './handlers/ai-usage';
import { assistantChatRoutes } from './handlers/assistant';
import { assistantVoiceRoutes } from './handlers/assistant-voice';
import { automationRoutes, sceneRoutes } from './handlers/automation';
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
import { signalRoutes } from './handlers/signals';
import { snapshotRoutes } from './handlers/snapshot';
import { talkRoutes } from './handlers/talk';
import { watchRoutes } from './handlers/watches';
import { weatherRoutes } from './handlers/weather';
import type { Operations } from './operations';
import type { Plugins } from './plugin-wiring';
import type { ReachRoutes } from './handlers/reach';
import type { ExtensionRouteTable, RouteTable } from './router';

export interface RouteServices {
  readonly voice: AssistantVoice;
  readonly budget: Budget;
  readonly schedules: Schedules;
  readonly plugins: Plugins;
  readonly reach: ReachRoutes;
}

export function routeTable(
  context: ServerContext,
  now: () => Date,
  services: RouteServices,
): RouteTable {
  return {
    ...assistantVoiceRoutes(services.voice),
    ...services.reach,
    ...pluginRoutes(context.store, services.plugins.admin),
    ...snapshotRoutes(context, now),
    ...accessRoutes(context),
    ...settingsRoutes(context),
    ...deviceRoutes(context),
    ...mediaRoutes(context),
    ...firewallRoutes(context),
    ...sceneRoutes(context),
    ...automationRoutes(context),
    ...healthRoutes(context),
    ...assistantRoutes(context),
    ...peopleRoutes(context),
    ...nutritionRoutes(context),
    ...watchRoutes(context),
    ...weatherRoutes(context, now),
    ...placeRoutes(context),
    ...talkRoutes(context),
    ...scheduleRoutes(context.store, services.schedules),
    ...signalRoutes(context),
    ...assistantChatRoutes(context),
    ...aiChatRoutes(context),
    ...aiCoordinationRoutes(context),
    ...aiUsageRoutes(context),
    ...aiBudgetRoutes(services.budget),
    ...aiModelRoutes(context),
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
        hub: options.core.hub,
        secrets: options.secrets,
        live: context.live,
        pushCommands: context.pushCommands,
        toolCalls: context.toolCalls,
        operations,
        dataDirectory: options.dataDirectory,
        log: options.log.forArea('hub.extension'),
      }),
    ),
  );
}
