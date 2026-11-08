import { registerReferencePackages, type NativeReferencePackage } from '../references/packages';
import type { Context } from '@deepseek-ai/cordis';
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { loadPlugin, pluginSkillsDirectory, type LoadedPlugin } from './claude-plugin-manifest';
import { pluginCommandDefinition } from './claude-plugin-commands';
import { filesystemSkillProvider } from './skill-filesystem';
import { registerManagedPackageExecution } from './plugin-execution';

const CONFIG = z.strictObject({});
export async function mountManagedPlugins(
  ctx: Context,
  raw: unknown,
  assets: readonly InstalledHarnessSkillAsset[],
): Promise<{ readonly dispose: () => Promise<void> }> {
  CONFIG.parse(raw);
  const plugins = await loadedManagedPlugins(assets);
  const packageReferences = referencePackages(plugins, assets);
  const fiber = ctx.plugin(async (scope: Context): Promise<void> => {
    registerManagedPackageExecution(ctx, scope, { plugins, assets });
    await mountManagedSurfaces(scope, plugins);
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
      restrictedCommands: [],
    };
  });
}
