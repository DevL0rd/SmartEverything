import type { Context } from '@deepseek-ai/cordis';
import type { AiHarnessPermission, AiHarnessStorageBinding } from '@smarteverything/domain';
import type { LoadedPlugin } from 'dsh-claude-plugin-loader-compat';
import { mapMcpServer } from 'dsh-claude-plugin-loader-compat';
import type { HarnessHost } from '../host/contracts';
import * as hooks from '@deepseek-ai/dsh-hooks-claude-code';
import * as mcp from '@deepseek-ai/dsh-mcp-client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { HarnessRuntimeError } from '../host/errors';

const HANDLER = z.strictObject({
  type: z.literal('command'),
  command: z.string().min(1),
  timeout: z.number().positive().optional(),
});
const MATCHER = z.strictObject({ matcher: z.string().optional(), hooks: z.array(HANDLER) });
const HOOKS = z.strictObject({
  description: z.string().optional(),
  hooks: z.record(
    z.enum([
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'Stop',
      'SubagentStart',
      'SubagentStop',
    ]),
    z.array(MATCHER),
  ),
});
interface Execution {
  readonly plugin: LoadedPlugin;
  readonly asset: InstalledHarnessSkillAsset;
  readonly hook: boolean;
  readonly servers: readonly string[];
}
const executions = new WeakMap<Context, readonly Execution[]>();

interface Policy {
  readonly hook_integrities: Readonly<Record<string, string>>;
  readonly mcp_integrities: Readonly<Record<string, string>>;
}
export async function registerManagedPackageExecution(
  ctx: Context,
  scope: Context,
  source: {
    readonly plugins: readonly LoadedPlugin[];
    readonly assets: readonly InstalledHarnessSkillAsset[];
    readonly policy: Policy;
  },
): Promise<void> {
  const selected: Execution[] = [];
  for (const [index, plugin] of source.plugins.entries()) {
    const asset = source.assets[index];
    if (asset === undefined)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Package execution has no verified artifact.',
      );
    await validateHooks(plugin, asset, source.policy);
    const servers = Object.keys(plugin.components.mcpServers);
    for (const name of servers) validateMcp(plugin, asset, name, source.policy);
    selected.push({ plugin, asset, hook: plugin.components.hooksFile !== undefined, servers });
  }
  executions.set(ctx, selected);
  scope.effect(() => (): void => {
    if (executions.get(ctx) === selected) executions.delete(ctx);
  });
}
async function validateHooks(
  plugin: LoadedPlugin,
  asset: InstalledHarnessSkillAsset,
  policy: Policy,
): Promise<void> {
  if (plugin.components.hooksFile === undefined) return;
  const bytes = await readFile(plugin.components.hooksFile);
  if (policy.hook_integrities[asset.asset.id] !== digest(bytes))
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Package hooks require their explicit current source integrity grant.',
    );
  const config = HOOKS.parse(JSON.parse(bytes.toString('utf8')));
  const handlers = Object.values(config.hooks).flatMap((matchers) =>
    matchers.flatMap((matcher) => matcher.hooks),
  );
  for (const handler of handlers) assertExecutable(handler.command);
}
function validateMcp(
  plugin: LoadedPlugin,
  asset: InstalledHarnessSkillAsset,
  name: string,
  policy: Policy,
): void {
  const entry = plugin.components.mcpServers[name];
  if (
    entry === undefined ||
    policy.mcp_integrities[`${asset.asset.id}:${name}`] !== digest(JSON.stringify(entry))
  )
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Package MCP processes require their explicit current source integrity grant.',
    );
  if (typeof entry['command'] === 'string') assertExecutable(entry['command']);
}
export async function mountManagedPackageExecution(
  ctx: Context,
  agentCtx: Context,
  host: HarnessHost,
  policy: {
    readonly binding: AiHarnessStorageBinding | undefined;
    readonly permission: AiHarnessPermission | undefined;
  },
): Promise<void> {
  for (const execution of executions.get(ctx) ?? []) {
    if (!execution.hook && execution.servers.length === 0) continue;
    const project = admittedExecutionProject(host, policy);
    await execution.asset.verify();
    if (execution.hook && execution.plugin.components.hooksFile !== undefined)
      await agentCtx.plugin(hooks, {
        configPath: execution.plugin.components.hooksFile,
        pluginRoot: execution.plugin.root,
        projectDir: project,
      });
    for (const serverKey of execution.servers)
      await mountMcp(agentCtx, execution.plugin, serverKey);
  }
}
function admittedExecutionProject(
  host: HarnessHost,
  policy: {
    readonly binding: AiHarnessStorageBinding | undefined;
    readonly permission: AiHarnessPermission | undefined;
  },
): string {
  if (
    host.target.kind !== 'device' ||
    policy.binding?.kind !== 'device' ||
    policy.permission?.sandbox !== 'danger-full-access' ||
    policy.permission.approval !== 'never'
  )
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Package hooks and MCP require an explicitly selected computer project with full execution permission.',
    );
  return policy.binding.path;
}
async function mountMcp(ctx: Context, plugin: LoadedPlugin, serverKey: string): Promise<void> {
  const entry = plugin.components.mcpServers[serverKey];
  if (entry === undefined)
    throw new HarnessRuntimeError('composition_incompatible', 'Verified MCP source is absent.');
  const mapped = mapMcpServer(entry, {
    pluginName: plugin.metadata.name,
    pluginRoot: plugin.root,
    serverKey,
    toolCallTimeoutMs: 60_000,
    failOnStartupError: true,
  });
  if (mapped.kind === 'skip')
    throw new HarnessRuntimeError('capability_unsupported', mapped.reason);
  await ctx.plugin(mcp, mapped.config);
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function assertExecutable(command: string): void {
  if (/(?:^|[\s;&|])(?:claude|@anthropic-ai\/claude-code)(?:\s|$)/u.test(command))
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'This package executable requires Claude Code, which is unavailable to the package bridge.',
    );
}
