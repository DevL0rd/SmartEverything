import type { Context } from '@deepseek-ai/cordis';
import * as AuxCompletions from './aux-completions';
import * as ContextGuards from './context-guards';
import * as ConversationProjector from './conversation-projector';
import * as Goals from './goals';
import * as HomeTools from './home-tools';
import * as HomeWebSearch from './home-web-search';
import * as Loops from './loops';
import * as Memory from './memory';
import * as Providers from './providers';
import * as SessionInfo from './session-info';
import * as SessionTitles from './session-titles';
import * as Subagents from './subagents';
import * as Terminals from './terminals';
import * as ToolArguments from './tool-arguments';
import * as Workspace from './workspace';
import type { HarnessPlugin, PluginEnvironment } from './types';

export type { HarnessPlugin, PluginEnvironment };

export const PLUGINS: readonly HarnessPlugin[] = [
  ToolArguments,
  ContextGuards,
  AuxCompletions,
  HomeWebSearch,
  HomeTools,
  Goals,
  Loops,
  Memory,
  Terminals,
  Workspace,
  SessionInfo,
  SessionTitles,
  ConversationProjector,
  Providers,
  Subagents,
];

export async function mountPlugins(ctx: Context, environment: PluginEnvironment): Promise<void> {
  for (const plugin of PLUGINS) await plugin.mount(ctx, environment);
}
