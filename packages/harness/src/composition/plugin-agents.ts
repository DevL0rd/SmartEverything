import type { Context } from '@deepseek-ai/cordis';
import SubagentRuntime, { type SubagentCapabilities } from '@deepseek-ai/dsh-subagent';
import type { ToolRunContext, ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import type { ClaudeAgentFile, LoadedPlugin } from './claude-plugin-manifest';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import type { PluginAgentPort } from './plugin-agent-port';
import { harnessMountRevisionBinding } from './mount-revision';
import { HarnessRuntimeError } from '../host/errors';

const CAPABILITIES: SubagentCapabilities = {
  agentOptions: false,
  outputSchema: false,
  depthLimit: false,
  toolFilter: false,
  persona: false,
};
interface Pending {
  readonly raw: unknown;
  readonly execution: ToolRunContext;
}
const PARAMETERS: ObjectJsonSchema = {
  type: 'object',
  properties: { prompt: { type: 'string' } },
  required: ['prompt'],
  additionalProperties: false,
};
const OUTPUT: ObjectJsonSchema = {
  type: 'object',
  properties: { child_id: { type: 'string' } },
  required: ['child_id'],
  additionalProperties: false,
};
export async function mountManagedPluginAgents(
  ctx: Context,
  plugins: readonly LoadedPlugin[],
  assets: readonly InstalledHarnessSkillAsset[],
  port: PluginAgentPort | undefined,
): Promise<void> {
  if (!plugins.some((plugin) => plugin.components.agents.length > 0)) return;
  await ctx.plugin(SubagentRuntime, { maxActiveSubagents: 3, maxDepth: 4 });
  await ctx.inject(['subagents', 'tools'], (active: Context): void => {
    for (const [index, plugin] of plugins.entries()) {
      const asset = assets[index];
      if (asset === undefined)
        throw new HarnessRuntimeError(
          'composition_incompatible',
          'Helper has no verified instruction package.',
        );
      for (const helper of plugin.components.agents)
        registerAgent(active, { helper, asset, packageName: plugin.metadata.name }, port);
    }
  });
}
function registerAgent(
  ctx: Context,
  source: {
    readonly helper: ClaudeAgentFile;
    readonly asset: InstalledHarnessSkillAsset;
    readonly packageName: string;
  },
  port: PluginAgentPort | undefined,
): void {
  const revision = harnessMountRevisionBinding();
  const provider = `smarteverything:${source.packageName}:${source.helper.name}`;
  const pending = new Map<string, Pending>();
  ctx.subagents.registerProvider({
    name: provider,
    inheritsParentContext: true,
    capabilities: CAPABILITIES,
    start: (request) => {
      const call = pending.get(request.parent.id);
      if (call === undefined || port === undefined)
        throw new HarnessRuntimeError(
          'capability_unsupported',
          'Durable helper admission is unavailable for this native call.',
        );
      return port.start(ctx, {
        revision: revision.revision(),
        asset: source.asset.asset,
        helper: source.helper.name,
        ...call,
        execution: { ...call.execution, signal: request.signal },
      });
    },
  });
  ctx.tools.register({
    name: `subagent_${source.helper.name}`,
    description: `${source.helper.description ?? `Delegate a bounded task to ${source.helper.name}.`} Keeps the selected chat model by default; an explicit source-model policy can select a compatible configured route.`,
    parameters: { ...PARAMETERS },
    output: {
      schema: { ...OUTPUT },
      render: (_raw, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: (): boolean => false,
    execute: (raw, execution) =>
      startAgent(ctx, { provider, label: source.helper.name, pending }, raw, execution),
  });
}
async function startAgent(
  ctx: Context,
  target: {
    readonly provider: string;
    readonly label: string;
    readonly pending: Map<string, Pending>;
  },
  raw: unknown,
  execution: ToolRunContext,
): Promise<{ readonly child_id: string }> {
  const parsed = z.strictObject({ prompt: z.string().min(1).max(16_000) }).parse(raw);
  if (execution.agent === undefined)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Helper delegation requires the exact calling conversation.',
    );
  target.pending.set(execution.agent.id, { raw: parsed, execution });
  try {
    const activation = await ctx.subagents.startActivation({
      provider: target.provider,
      label: target.label,
      signal: execution.signal,
      delivery: 'caller',
      request: { parent: execution.agent, prompt: [{ type: 'text', text: parsed.prompt }] },
    });
    return { child_id: activation.childId };
  } finally {
    target.pending.delete(execution.agent.id);
  }
}
