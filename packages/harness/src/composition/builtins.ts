import { createHash } from 'node:crypto';
import type { HarnessPluginMetadata, HarnessSkillAsset, JsonValue } from '@smarteverything/domain';
import { HARNESS_PLUGIN_METADATA } from '@smarteverything/domain';
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
import { mountNativeSkills, SKILLS_CONFIG } from './skills';
import { builtinMetadata, HARNESS_DSH_VERSION } from './builtin-metadata';
import { mountHeadlessBrowser } from './browser';
import type {
  HarnessExtensionKind,
  HarnessSkillAssets,
  InstalledHarnessSkillAsset,
} from './skill-assets';
import { HarnessRuntimeError } from '../host/errors';

export const HARNESS_CODEGRAPH_PACKAGE = '@smarteverything/harness-codegraph';
export const HARNESS_CODEGRAPH_VERSION = '0.1.6';
export const HARNESS_SKILLS_PACKAGE = '@smarteverything/harness-skills';
export const HARNESS_SKILLS_VERSION = HARNESS_DSH_VERSION;
export const HARNESS_BROWSER_PACKAGE = '@smarteverything/harness-browser';
export const HARNESS_BROWSER_VERSION = HARNESS_DSH_VERSION;
const ALL_PLATFORMS: HarnessPluginMetadata['platforms'] = ['linux', 'macos', 'windows'];

export function skillCatalogueLength(desired: HarnessDesiredConfiguration): number {
  const entry = desired.entries.find(
    (candidate) => candidate.package === HARNESS_SKILLS_PACKAGE && candidate.enabled,
  );
  return SKILLS_CONFIG.parse(entry?.config ?? {}).catalog_description_max_length;
}

interface Builtin {
  readonly id: string;
  readonly package: string;
  readonly version: string;
  readonly metadata: HarnessPluginMetadata;
}

const CODEGRAPH: Builtin = {
  id: 'codegraph',
  package: HARNESS_CODEGRAPH_PACKAGE,
  version: HARNESS_CODEGRAPH_VERSION,
  metadata: builtinMetadata({
    id: 'codegraph',
    version: HARNESS_CODEGRAPH_VERSION,
    kind: 'tools',
    platforms: ['linux'],
    serverSafe: true,
  }),
};
const SKILLS: Builtin = {
  id: 'skills',
  package: HARNESS_SKILLS_PACKAGE,
  version: HARNESS_SKILLS_VERSION,
  metadata: builtinMetadata({
    id: 'skills',
    version: HARNESS_SKILLS_VERSION,
    kind: 'skills',
    platforms: ALL_PLATFORMS,
    serverSafe: true,
  }),
};
const BROWSER: Builtin = {
  id: 'browser',
  package: HARNESS_BROWSER_PACKAGE,
  version: HARNESS_BROWSER_VERSION,
  metadata: builtinMetadata({
    id: 'browser',
    version: HARNESS_BROWSER_VERSION,
    kind: 'tools',
    platforms: ['linux'],
    serverSafe: false,
  }),
};
const CLAUDE_PLUGINS: Builtin = {
  id: 'claude-plugins',
  package: HARNESS_CLAUDE_PLUGINS_PACKAGE,
  version: HARNESS_CLAUDE_PLUGINS_VERSION,
  metadata: HARNESS_CLAUDE_PLUGINS_METADATA,
};
const BUILTINS: readonly Builtin[] = [CODEGRAPH, SKILLS, BROWSER, CLAUDE_PLUGINS];

export interface HarnessBuiltinSelection {
  readonly enabled: boolean;
  readonly config: Readonly<Record<string, JsonValue>>;
}
export interface HarnessDesiredInputs {
  readonly selections?: Readonly<Record<string, HarnessBuiltinSelection>>;
  readonly skills?: readonly HarnessSkillAsset[];
  readonly plugins?: readonly HarnessSkillAsset[];
}

export const HARNESS_BUILTIN_IDS = BUILTINS.map((builtin) => builtin.id);

export function desiredHarnessConfiguration(
  input: HarnessDesiredInputs = {},
): HarnessDesiredConfiguration {
  const assets: Readonly<Record<string, readonly HarnessSkillAsset[]>> = {
    skills: input.skills ?? [],
    'claude-plugins': input.plugins ?? [],
  };
  const entries = BUILTINS.map((builtin): HarnessDesiredEntry => ({
    id: builtin.id,
    package: builtin.package,
    version: builtin.version,
    enabled: input.selections?.[builtin.id]?.enabled ?? true,
    config: input.selections?.[builtin.id]?.config ?? {},
    metadata: {
      ...builtin.metadata,
      skill_assets: [...(assets[builtin.id] ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)),
    },
  }));
  return {
    revision: `configuration-${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`,
    entries,
  };
}

export function installedHarnessBuiltins(
  host: HarnessHost,
  assets?: HarnessSkillAssets,
  pluginAgents?: PluginAgentPort,
): readonly InstalledHarnessPlugin[] {
  return [
    {
      ...installed(CODEGRAPH),
      platforms: ['linux'],
      serverSafe: true,
      mount: mountCodeIndexer,
    },
    installedSkills(host, assets),
    installedManagedPlugins(host, assets, pluginAgents),
    {
      ...installed(BROWSER),
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

function installed(
  builtin: Builtin,
): Pick<InstalledHarnessPlugin, 'package' | 'version' | 'provenance' | 'metadata'> {
  return {
    package: builtin.package,
    version: builtin.version,
    provenance: builtin.metadata.provenance,
    metadata: builtin.metadata,
  };
}

function installedSkills(
  host: HarnessHost,
  assets: HarnessSkillAssets | undefined,
): InstalledHarnessPlugin {
  return {
    ...installed(SKILLS),
    platforms: ALL_PLATFORMS,
    serverSafe: true,
    mount: (ctx, config) => mountNativeSkills(ctx, host, config),
    resolve: async (entry): Promise<InstalledHarnessPlugin> => {
      const acquired = await acquire(assets, 'skill', entry);
      return {
        ...installedSkills(host, assets),
        metadata: withAssets(SKILLS, acquired),
        mount: (ctx, config) => mountNativeSkills(ctx, host, config, acquired),
      };
    },
  };
}

function installedManagedPlugins(
  host: HarnessHost,
  assets: HarnessSkillAssets | undefined,
  pluginAgents?: PluginAgentPort,
): InstalledHarnessPlugin {
  return {
    ...installed(CLAUDE_PLUGINS),
    platforms: ALL_PLATFORMS,
    serverSafe: true,
    mount: (ctx, config) => mountManagedPlugins(ctx, config, [], pluginAgents),
    resolve: async (entry): Promise<InstalledHarnessPlugin> => {
      const acquired = await acquire(assets, 'plugin', entry);
      return {
        ...installedManagedPlugins(host, assets, pluginAgents),
        metadata: withAssets(CLAUDE_PLUGINS, acquired),
        mount: (ctx, config) => mountManagedPlugins(ctx, config, acquired, pluginAgents),
      };
    },
  };
}

async function acquire(
  assets: HarnessSkillAssets | undefined,
  kind: HarnessExtensionKind,
  entry: HarnessDesiredEntry,
): Promise<readonly InstalledHarnessSkillAsset[]> {
  const wanted = entry.metadata?.skill_assets ?? [];
  if (wanted.length === 0) return [];
  if (assets === undefined)
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'This host cannot reach the Home Hub skill and plugin store.',
    );
  return assets.acquireAll(kind, wanted);
}

function withAssets(
  builtin: Builtin,
  acquired: readonly InstalledHarnessSkillAsset[],
): HarnessPluginMetadata {
  return HARNESS_PLUGIN_METADATA.parse({
    ...builtin.metadata,
    skill_assets: acquired.map((asset) => asset.asset),
  });
}
