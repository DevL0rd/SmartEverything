import { registerReferencePackages, type NativeReferencePackage } from '../references/packages';
import type { Context } from '@deepseek-ai/cordis';
import { CommandDefinitionId, type CommandResult } from '@deepseek-ai/dsh-commands';
import {
  buildCommandDefinition,
  loadPlugin,
  parseMarkdownFile,
  type LoadedPlugin,
  type PluginSkillEntry,
} from 'dsh-claude-plugin-loader-compat';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { approvedHarnessPluginAsset, pluginRoot } from './claude-plugin-inspection';
import { managedPluginSkills } from './claude-plugin-skills';
import { mountManagedPluginAgents } from './plugin-agents';
import type { PluginAgentPort } from './plugin-agent-port';
import { registerManagedPackageExecution } from './plugin-execution';
import { registerManagedPluginSurfaces } from './managed-plugin-registry';

const CONFIG = z.strictObject({
  agent_model_policy: z.enum(['inherit', 'source']).default('inherit'),
  hook_integrities: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)).default({}),
  mcp_integrities: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)).default({}),
  model_routes: z
    .record(z.string(), z.strictObject({ provider: z.uuid(), model: z.string().min(1).max(200) }))
    .default({}),
});
export async function mountManagedPlugins(
  ctx: Context,
  raw: unknown,
  assets: readonly InstalledHarnessSkillAsset[],
  port?: PluginAgentPort,
): Promise<{ readonly dispose: () => Promise<void> }> {
  const config = CONFIG.parse(raw);
  const plugins = await loadedManagedPlugins(assets);
  const packageReferences = await referencePackages(plugins, assets);
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    await registerManagedPackageExecution(ctx, scope, { plugins, assets, policy: config });
    await mountManagedPluginAgents(scope, plugins, assets, port);
    await mountManagedSurfaces(ctx, scope, { plugins, assets });
    scope.effect(() => registerReferencePackages(ctx, packageReferences));
  });
  try {
    await fiber;
    return { dispose: fiber.dispose };
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}
async function loadedManagedPlugins(
  assets: readonly InstalledHarnessSkillAsset[],
): Promise<readonly LoadedPlugin[]> {
  const plugins: LoadedPlugin[] = [];
  const names = new Set<string>();
  for (const asset of assets) {
    const approved = approvedHarnessPluginAsset(asset.asset);
    await asset.verify();
    const plugin = loadPlugin(pluginRoot(asset.entrypoint, asset.asset.entrypoint));
    if (plugin.metadata.name !== approved.name || names.has(plugin.metadata.name))
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Managed instruction package identities differ or collide.',
      );
    names.add(plugin.metadata.name);
    plugins.push(plugin);
  }
  return plugins;
}
async function mountManagedSurfaces(
  ctx: Context,
  scope: Context,
  source: {
    readonly plugins: readonly LoadedPlugin[];
    readonly assets: readonly InstalledHarnessSkillAsset[];
  },
): Promise<void> {
  const skills: PluginSkillEntry[] = [];
  for (const plugin of source.plugins) {
    for (const skill of plugin.components.skills) {
      if ((skill.allowedTools?.length ?? 0) > 0)
        throw new HarnessRuntimeError(
          'capability_unsupported',
          `Instruction ${skill.name} requires a per-invocation tool restriction that cannot be omitted.`,
        );
      skills.push({ pluginName: plugin.metadata.name, pluginRoot: plugin.root, skill });
    }
    await registerCommands(scope, plugin);
  }
  scope.effect(() =>
    registerManagedPluginSurfaces(
      ctx,
      source.plugins.flatMap((plugin) =>
        plugin.components.agents.map((helper) => `subagent_${helper.name}`),
      ),
      skills.map((entry) => entry.skill.name),
    ),
  );
  if (skills.length > 0)
    await scope.inject(['skills'], (active: Context): void => {
      active.skills.registerProvider(() => managedPluginSkills(skills, source.assets));
    });
}
async function registerCommands(ctx: Context, plugin: LoadedPlugin): Promise<void> {
  for (const command of plugin.components.commands) {
    const source = parseMarkdownFile(await readFile(command.path, 'utf8'), command.path);
    const restricted = source.frontmatter['allowed-tools'] !== undefined;
    const definition = buildCommandDefinition(command, plugin.root);
    ctx.commands.register({
      ...definition,
      definitionId: CommandDefinitionId(`smarteverything:${plugin.metadata.name}:${command.name}`),
      ...(restricted
        ? {
            handler: (): CommandResult => ({
              kind: 'error',
              text: `/${command.name} requires tool restrictions that are unavailable for this command invocation.`,
            }),
          }
        : {}),
    });
  }
}

async function referencePackages(
  plugins: readonly LoadedPlugin[],
  assets: readonly InstalledHarnessSkillAsset[],
): Promise<readonly NativeReferencePackage[]> {
  return Promise.all(
    plugins.map(async (plugin, index): Promise<NativeReferencePackage> => {
      const asset = assets[index];
      if (asset === undefined)
        throw new HarnessRuntimeError(
          'composition_incompatible',
          'Native package reference has no exact asset.',
        );
      return {
        asset,
        name: plugin.metadata.name,
        description: plugin.metadata.description ?? `Installed package ${plugin.metadata.name}.`,
        agents: plugin.components.agents.map((helper) => ({
          identity: `smarteverything:${plugin.metadata.name}:${helper.name}`,
          name: helper.name,
          tool: `subagent_${helper.name}`,
          description: helper.description ?? `Delegate to ${helper.name}.`,
        })),
        restrictedCommands: await restrictedCommandIds(plugin),
      };
    }),
  );
}

async function restrictedCommandIds(plugin: LoadedPlugin): Promise<readonly string[]> {
  const ids: string[] = [];
  for (const command of plugin.components.commands) {
    const source = parseMarkdownFile(await readFile(command.path, 'utf8'), command.path);
    if (source.frontmatter['allowed-tools'] !== undefined)
      ids.push(`smarteverything:${plugin.metadata.name}:${command.name}`);
  }
  return ids;
}
