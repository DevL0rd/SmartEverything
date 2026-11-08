import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import { bindScopeParent, createScope, scopeOf, scopeParentOf } from '@deepseek-ai/dsh-scope';
import Subagent from '@deepseek-ai/dsh-subagent';
import * as ForkInProcess from '@deepseek-ai/dsh-subagent-fork-in-process';
import * as SpawnInProcess from '@deepseek-ai/dsh-subagent-spawn-in-process';
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent';
import SubagentModelSelection from '@deepseek-ai/dsh-tool-subagent/model-selection-settings';
import * as ToolSubagentControl from '@deepseek-ai/dsh-tool-subagent-control';
import * as ToolListAgents from '@deepseek-ai/dsh-tool-subagent-control/list-agents';
import { omitDirectedSettlementNotices } from './helper-settlement-notices';
import { observeHelperRelayReceipts } from './helper-relay-receipts';
import { configured, provideAgentLoopSettings } from './goals';

export const name = 'subagents';

export const SUBAGENT_TOOL_NAMES = [
  'subagent',
  'subagent_fork',
  'send_message',
  'interrupt_agent',
  'list_agents',
] as const;

export const SUBAGENT_MODELS_TOOL = 'list_subagent_models';

export const SUBAGENT_MODEL_POLICY_EVENT = 'subagent/model-selection-policy';

export interface SubagentModelRoute {
  readonly provider: string;
  readonly model: string;
}

export const SPAWN_PROVIDER = 'spawn';
export const FORK_PROVIDER = 'fork';

export function helperModelGuide(provider: string | undefined): string {
  const route =
    provider === undefined
      ? 'the route id that `list_subagent_models` prints before the dash'
      : `\`${provider}\``;
  return `Helper models: the \`subagent\` tool takes \`provider\`, \`model\` and \`reasoning_effort\`. Leave them out so the helper runs on the same model and effort as this chat; do not specify a model unless other instructions or the person ask for one. \`provider\` is always ${route}, never a company name such as OpenRouter, and goes together with \`model\`; \`list_subagent_models\` with that provider lists the models the person may use, and \`~\` aliases must be written exactly as shown, never a dated or made-up name.`;
}

const CHILD_TOOLS: ReadonlySet<string> = new Set(['subagent', 'subagent_fork']);

const CHILD_DIRECTORY = z.object({ cwd: z.string() });

async function enterable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause) return false;
    throw cause;
  }
}

async function childDirectory(
  scope: Context,
  execution: Readonly<ToolExecution>,
): Promise<string | undefined> {
  const asked = CHILD_DIRECTORY.safeParse(execution.arguments);
  const agent = execution.agent;
  if (!CHILD_TOOLS.has(execution.name) || !asked.success || agent === undefined) return undefined;
  const { cwd } = asked.data;
  return isAbsolute(cwd)
    ? cwd
    : resolve(await scope.workingDirectory.ensure(agent, execution.signal), cwd);
}

function guardChildDirectory(scope: Context): void {
  scope.on('tools/pre-execute', async (execution, next): Promise<PreToolDecision> => {
    const cwd = await childDirectory(scope, execution);
    if (cwd === undefined || (await enterable(cwd))) return next();
    return { kind: 'deny', reason: `The helper's working directory does not exist: "${cwd}".` };
  });
}

async function settleService(scope: Context): Promise<void> {
  const { subagents } = scope.agentLoopSettings.settings;
  const config = configured([
    ['maxDepth', subagents.max_depth],
    ['maxActiveSubagents', subagents.max_active],
  ]);
  const running = [...(scope.root.registry.get(Subagent)?.fibers ?? [])];
  if (running.length === 0) await scope.root.plugin(Subagent, config);
  for (const fiber of running) {
    fiber.update(config);
    await fiber.await();
  }
}

function guideModelChoice(scope: Context): void {
  scope.systemPrompt.section({
    name: 'smarteverything-helper-models',
    order: scope.systemPrompt.getContextOrder('SUBAGENT_DELEGATION'),
    interpolate: false,
    text: (context) =>
      context.agent !== undefined &&
      scope.tools.get(SUBAGENT_MODELS_TOOL, context.scope) !== undefined
        ? helperModelGuide(context.agent.options.provider)
        : '',
  });
}

function composeAgents(scope: Context): Context {
  const composition = createScope(scope, {});
  const key = scopeOf(composition.ctx);
  if (key === undefined) throw new Error('The helper composition lost its scope.');
  scope.on('session/created', (session) => {
    const agent = scope.agents.get(session.id);
    const agentScope = agent === undefined ? undefined : scopeOf(agent.ctx);
    if (agentScope !== undefined && scopeParentOf(agentScope) === undefined)
      bindScopeParent(agentScope, key);
  });
  return composition.ctx;
}

async function mountSubagents(scope: Context): Promise<void> {
  await settleService(scope);
  await scope.plugin(SubagentModelSelection, {});
  await scope.plugin(SpawnInProcess, { providerName: SPAWN_PROVIDER });
  await scope.plugin(ForkInProcess, { providerName: FORK_PROVIDER });
  const composition = composeAgents(scope);
  await composition.plugin(ToolSubagent, {
    provider: SPAWN_PROVIDER,
    toolName: 'subagent',
    modelSelectionSettings: true,
  });
  await scope.plugin(ToolSubagent, { provider: FORK_PROVIDER, toolName: 'subagent_fork' });
  await scope.plugin(ToolSubagentControl);
  observeHelperRelayReceipts(scope);
  omitDirectedSettlementNotices(scope);
  await scope.plugin(ToolListAgents);
  await scope.inject(['systemPrompt', 'tools'], guideModelChoice);
  await scope.inject(['tools', 'workingDirectory'], guardChildDirectory);
}

export async function mount(ctx: Context): Promise<void> {
  await provideAgentLoopSettings(ctx);
  await ctx.inject(['agentLoopSettings', 'agents'], mountSubagents);
}
