import { registerReferencePackages, type NativeReferencePackage } from '../references/packages';
import type { Context } from '@deepseek-ai/cordis';
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { loadPlugin, pluginSkillsDirectory, type LoadedPlugin } from './claude-plugin-manifest';
import { pluginCommandDefinition } from './claude-plugin-commands';
import { filesystemSkillProvider } from './skill-filesystem';
import { mountManagedPluginAgents } from './plugin-agents';
import type { PluginAgentPort } from './plugin-agent-port';
import { registerManagedPackageExecution } from './plugin-execution';
import { registerManagedPluginSurfaces } from './managed-plugin-registry';

const CONFIG = z.strictObject({
  agent_model_policy: z.enum(['inherit', 'source']).default('inherit'),
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
  CONFIG.parse(raw);
  const plugins = await loadedManagedPlugins(assets);
  const packageReferences = referencePackages(plugins, assets);
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    registerManagedPackageExecution(ctx, scope, { plugins, assets });
    await mountManagedPluginAgents(scope, plugins, assets, port);
    await mountManagedSurfaces(ctx, scope, plugins);
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
    const plugin = await loadPlugin(asset.directory);
    if (names.has(plugin.metadata.name))
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Two installed plugins are both named ${plugin.metadata.name}.`,
      );
    names.add(plugin.metadata.name);
    plugins.push(plugin);
  }
  return plugins;
}
async function mountManagedSurfaces(
  ctx: Context,
  scope: Context,
  plugins: readonly LoadedPlugin[],
): Promise<void> {
  for (const plugin of plugins)
    for (const command of plugin.components.commands)
      scope.commands.register({
        ...pluginCommandDefinition(command, plugin.root),
        definitionId: CommandDefinitionId(
          `smarteverything:${plugin.metadata.name}:${command.name}`,
        ),
      });
  scope.effect(() =>
    registerManagedPluginSurfaces(
      ctx,
      plugins.flatMap((plugin) =>
        plugin.components.agents.map((helper) => `subagent_${helper.name}`),
      ),
    ),
  );
  if (plugins.length > 0)
    await scope.inject(['skills'], (active: Context): void => {
      active.skills.registerProvider((control) =>
        filesystemSkillProvider(active, control, {
          providerName: 'smarteverything-managed-instructions',
          includeDefaultRoots: false,
          watch: false,
          customSkillDirs: plugins.map(pluginSkillsDirectory),
        }),
      );
    });
}

function referencePackages(
  plugins: readonly LoadedPlugin[],
  assets: readonly InstalledHarnessSkillAsset[],
): readonly NativeReferencePackage[] {
  return plugins.map((plugin, index): NativeReferencePackage => {
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
      restrictedCommands: [],
    };
  });
}
