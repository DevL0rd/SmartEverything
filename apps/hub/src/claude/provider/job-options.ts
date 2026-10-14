import type { Options, HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeMcpServers, ProviderTurn } from '@smarteverything/domain';
import type { ProviderJobOptions } from './job';
import type { ProviderTools } from './tools';
import type { ProviderPrompts } from './prompts';
import type { ProviderDialogs } from './dialogs';
import { configuredOptions } from './configured-options';
import { subscriptionEnvironment } from './options';
import { managedJobOptions } from './managed-project';
interface JobContext {
  readonly options: ProviderJobOptions;
  readonly abort: AbortController;
  readonly externalServers: ClaudeMcpServers;
  readonly tools: ProviderTools;
  readonly prompts: ProviderPrompts;
  readonly dialogs: ProviderDialogs;
  readonly session: () => string;
  readonly toolHook: (input: HookInput, allowed: ReadonlySet<string>) => Promise<HookJSONOutput>;
}
export function jobOptions(context: JobContext): Options {
  const { turn, executable, cwd } = context.options;
  const builtin = [...turn.options.builtin_tools, 'AskUserQuestion', 'ExitPlanMode'];
  const allowed = new Set([...builtin, ...turn.tools.map((tool) => `mcp__home__${tool.name}`)]);
  return {
    ...configuredOptions(turn),
    cwd,
    model: turn.model,
    abortController: context.abort,
    env: subscriptionEnvironment(),
    includePartialMessages: true,
    enableFileCheckpointing: turn.managed_project === undefined,
    tools: baseTools(turn, builtin),
    allowedTools: turn.tools.map((tool) => `mcp__home__${tool.name}`),
    mcpServers: {
      ...(turn.managed_project === undefined ? context.externalServers : {}),
      home: context.tools.server,
    },
    canUseTool: context.prompts.callback(context.session),
    onUserDialog: context.dialogs.userDialog,
    onElicitation: context.dialogs.elicitation,
    supportedDialogKinds: [],
    hooks: {
      PreToolUse: [
        { hooks: [(input): Promise<HookJSONOutput> => context.toolHook(input, allowed)] },
      ],
    },
    ...managedJobOptions(turn),
    ...(turn.session_id === null ? { sessionId: turn.job_id } : { resume: turn.session_id }),
    ...(executable === undefined ? {} : { pathToClaudeCodeExecutable: executable }),
  };
}

function baseTools(turn: ProviderTurn, builtin: string[]): NonNullable<Options['tools']> {
  if (turn.managed_project !== undefined) return [];
  if (turn.options.builtin_tools.length === 0) return { type: 'preset', preset: 'claude_code' };
  return builtin;
}
