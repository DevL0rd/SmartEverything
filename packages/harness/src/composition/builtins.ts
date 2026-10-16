import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { HarnessHost } from '../host/contracts';
import type {
  HarnessDesiredConfiguration,
  HarnessDesiredEntry,
  InstalledHarnessPlugin,
} from './configuration';
import { mountCodeIndexer } from './indexer';
import {
  HARNESS_CLAUDE_PLUGINS_METADATA,
  HARNESS_CLAUDE_PLUGINS_PACKAGE,
  HARNESS_CLAUDE_PLUGINS_VERSION,
} from './claude-plugin-metadata';
import { mountManagedPlugins } from './claude-plugins';
import type { PluginAgentPort } from './plugin-agent-port';
import { mountNativeSkills } from './skills';
import {
  HARNESS_CODEGRAPH_METADATA,
  HARNESS_SKILLS_METADATA,
  HARNESS_BROWSER_METADATA,
  HARNESS_RUNTIME_REVISION,
} from './builtin-metadata';
import { mountHeadlessBrowser } from './browser';
import type { HarnessSkillAssets } from './skill-assets';
import { HarnessRuntimeError } from '../host/errors';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
import { upgradeBuiltinRuntimeMetadata } from './builtin-runtime-upgrade';

export const HARNESS_CODEGRAPH_PACKAGE = '@smarteverything/harness-codegraph';
export const HARNESS_CODEGRAPH_VERSION = '0.1.6-smarteverything.3';
export const HARNESS_SKILLS_PACKAGE = '@smarteverything/harness-skills';
export const HARNESS_SKILLS_VERSION = '0.2.1-alpha.2';
export const HARNESS_BROWSER_PACKAGE = '@smarteverything/harness-browser';
export const HARNESS_BROWSER_VERSION = '0.2.1-alpha.2';
const PRE_BROWSER_DEFAULT_REVISION = 'builtin-indexer-skills-v3-native-value-imports';
const DEFAULT_REVISION = 'builtin-indexer-skills-browser-v1';

export function installedHarnessBuiltins(
  host: HarnessHost,
  assets?: HarnessSkillAssets,
  pluginAgents?: PluginAgentPort,
): readonly InstalledHarnessPlugin[] {
  return [
    {
      package: HARNESS_CODEGRAPH_PACKAGE,
      version: HARNESS_CODEGRAPH_VERSION,
      provenance: HARNESS_CODEGRAPH_METADATA.provenance,
      metadata: HARNESS_CODEGRAPH_METADATA,
      platforms: ['linux'],
      serverSafe: true,
      mount: mountCodeIndexer,
    },
    installedSkills(host, assets),
    installedManagedPlugins(host, assets, pluginAgents),
    {
      package: HARNESS_BROWSER_PACKAGE,
      version: HARNESS_BROWSER_VERSION,
      provenance: HARNESS_BROWSER_METADATA.provenance,
      metadata: HARNESS_BROWSER_METADATA,
      platforms: ['linux'],
      serverSafe: false,
      features: ['browser', 'mcp'],
      mount: (ctx, config): ReturnType<InstalledHarnessPlugin['mount']> => {
        if (host.target.kind === 'server' || host.platform !== 'linux')
          throw new HarnessRuntimeError(
            'capability_unsupported',
            'Headless browser is available only on a local Linux execution computer.',
          );
        return mountHeadlessBrowser(ctx, config);
      },
    },
  ];
}

export function defaultHarnessBuiltins(): HarnessDesiredConfiguration {
  return {
    revision: DEFAULT_REVISION,
    entries: [
      {
        id: 'codegraph',
        package: HARNESS_CODEGRAPH_PACKAGE,
        version: HARNESS_CODEGRAPH_VERSION,
        enabled: true,
        config: {},
        metadata: HARNESS_CODEGRAPH_METADATA,
      },
      {
        id: 'skills',
        package: HARNESS_SKILLS_PACKAGE,
        version: HARNESS_SKILLS_VERSION,
        enabled: true,
        config: {},
        metadata: HARNESS_SKILLS_METADATA,
      },
      browserDefault(),
    ],
  };
}

export function upgradeHarnessBuiltins(
  current: HarnessDesiredConfiguration,
): HarnessDesiredConfiguration {
  const previous =
    current.revision === PRE_BROWSER_DEFAULT_REVISION &&
    !current.entries.some(
      (entry) => entry.id === 'browser' || entry.package === HARNESS_BROWSER_PACKAGE,
    )
      ? { revision: DEFAULT_REVISION, entries: [...current.entries, browserDefault()] }
      : current;
  return upgradeBuiltinRuntimeMetadata(
    upgradeNativeIndexer(upgradeSharedSkillEligibility(previous)),
  );
}

function browserDefault(): HarnessDesiredEntry {
  return {
    id: 'browser',
    package: HARNESS_BROWSER_PACKAGE,
    version: HARNESS_BROWSER_VERSION,
    enabled: true,
    config: {},
    metadata: HARNESS_BROWSER_METADATA,
  };
}

function installedSkills(
  host: HarnessHost,
  assets: HarnessSkillAssets | undefined,
): InstalledHarnessPlugin {
  return {
    package: HARNESS_SKILLS_PACKAGE,
    version: HARNESS_SKILLS_VERSION,
    provenance: HARNESS_SKILLS_METADATA.provenance,
    metadata: HARNESS_SKILLS_METADATA,
    platforms: ['linux', 'macos', 'windows'],
    serverSafe: true,
    mount: (ctx, config) => mountNativeSkills(ctx, host, config),
    resolve: (entry) => resolveSkills(host, assets, entry),
  };
}

async function resolveSkills(
  host: HarnessHost,
  assets: HarnessSkillAssets | undefined,
  entry: HarnessDesiredEntry,
): Promise<InstalledHarnessPlugin> {
  if (
    entry.metadata === undefined ||
    JSON.stringify({ ...entry.metadata, skill_assets: [] }) !==
      JSON.stringify(HARNESS_SKILLS_METADATA)
  )
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'Desired native skill metadata differs from the pinned artifact.',
    );
  if (entry.metadata.skill_assets.length === 0) return installedSkills(host, assets);
  if (assets === undefined)
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Immutable skill asset source is unavailable on this host.',
    );
  const acquired = await assets.acquireAll(entry.metadata.skill_assets);
  const metadata = HARNESS_PLUGIN_METADATA.parse({
    ...HARNESS_SKILLS_METADATA,
    skill_assets: acquired.map((asset) => asset.asset),
  });
  return {
    ...installedSkills(host, assets),
    metadata,
    mount: (ctx, config) => mountNativeSkills(ctx, host, config, acquired),
  };
}

function installedManagedPlugins(
  host: HarnessHost,
  assets: HarnessSkillAssets | undefined,
  pluginAgents?: PluginAgentPort,
): InstalledHarnessPlugin {
  return {
    package: HARNESS_CLAUDE_PLUGINS_PACKAGE,
    version: HARNESS_CLAUDE_PLUGINS_VERSION,
    provenance: HARNESS_CLAUDE_PLUGINS_METADATA.provenance,
    metadata: HARNESS_CLAUDE_PLUGINS_METADATA,
    platforms: ['linux', 'macos', 'windows'],
    serverSafe: true,
    mount: (ctx, config) => mountManagedPlugins(ctx, config, [], pluginAgents),
    resolve: async (entry): Promise<InstalledHarnessPlugin> => {
      if (
        entry.metadata === undefined ||
        JSON.stringify({ ...entry.metadata, skill_assets: [] }) !==
          JSON.stringify(HARNESS_CLAUDE_PLUGINS_METADATA)
      )
        throw new HarnessRuntimeError(
          'composition_incompatible',
          'Managed package metadata differs from its pinned adapter.',
        );
      if (assets === undefined)
        throw new HarnessRuntimeError(
          'runtime_unavailable',
          'Managed package assets are unavailable on this host.',
        );
      const acquired = await assets.acquireAll(entry.metadata.skill_assets);
      return {
        ...installedManagedPlugins(host, assets, pluginAgents),
        metadata: entry.metadata,
        mount: (ctx, config) => mountManagedPlugins(ctx, config, acquired, pluginAgents),
      };
    },
  };
}

function upgradeSharedSkillEligibility(
  current: HarnessDesiredConfiguration,
): HarnessDesiredConfiguration {
  const entries = current.entries.map((entry): HarnessDesiredEntry => {
    if (
      entry.id !== 'skills' ||
      entry.package !== HARNESS_SKILLS_PACKAGE ||
      entry.version !== HARNESS_SKILLS_VERSION ||
      entry.metadata === undefined
    )
      return entry;
    const previous = {
      ...HARNESS_SKILLS_METADATA,
      runtime_version: HARNESS_RUNTIME_REVISION,
      platforms: ['linux'],
      server_safe: false,
      skill_assets: entry.metadata.skill_assets,
    };
    if (!isDeepStrictEqual(entry.metadata, previous)) return entry;
    return {
      ...entry,
      metadata: { ...HARNESS_SKILLS_METADATA, skill_assets: entry.metadata.skill_assets },
    };
  });
  return entries.some((entry, index) => entry !== current.entries[index])
    ? {
        revision: `shared-skills-${createHash('sha256')
          .update(JSON.stringify({ previous: current.revision, entries }))
          .digest('hex')}`,
        entries,
      }
    : current;
}

function upgradeNativeIndexer(current: HarnessDesiredConfiguration): HarnessDesiredConfiguration {
  const entries = current.entries.map((entry): HarnessDesiredEntry => {
    if (
      entry.package !== HARNESS_CODEGRAPH_PACKAGE ||
      entry.version !== '0.1.6-smarteverything.2' ||
      !isDeepStrictEqual(entry.metadata, {
        ...HARNESS_CODEGRAPH_METADATA,
        runtime_version: HARNESS_RUNTIME_REVISION,
        server_safe: false,
        adapter: { ...HARNESS_CODEGRAPH_METADATA.adapter, version: '0.1.6-smarteverything.2' },
      })
    )
      return entry;
    return { ...entry, version: HARNESS_CODEGRAPH_VERSION, metadata: HARNESS_CODEGRAPH_METADATA };
  });
  return entries.some((entry, index) => entry !== current.entries[index])
    ? {
        revision: `native-indexer-${createHash('sha256')
          .update(JSON.stringify({ previous: current.revision, entries }))
          .digest('hex')}`,
        entries,
      }
    : current;
}
