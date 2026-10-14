import {
  HARNESS_CLAUDE_PLUGINS_PACKAGE,
  HARNESS_CLAUDE_PLUGINS_VERSION,
  HARNESS_CLAUDE_PLUGINS_METADATA,
} from '@smarteverything/harness';
import {
  HARNESS_EXTENSION_ITEM,
  type HarnessDesiredConfiguration,
  type HarnessDesiredEntry,
  type HarnessSkillAsset,
  type HarnessSkillPresentation,
  type HarnessExtensionItem,
} from '@smarteverything/domain';

export function claudePluginsEntry(desired: HarnessDesiredConfiguration): HarnessDesiredEntry {
  return (
    desired.entries.find((entry) => entry.id === 'claude-plugins') ?? {
      id: 'claude-plugins',
      package: HARNESS_CLAUDE_PLUGINS_PACKAGE,
      version: HARNESS_CLAUDE_PLUGINS_VERSION,
      enabled: true,
      config: {},
      metadata: HARNESS_CLAUDE_PLUGINS_METADATA,
    }
  );
}

export function claudePluginProvider(entry: HarnessDesiredEntry): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: entry.id,
    kind: 'extension',
    included: true,
    name: 'Coding plugins',
    description: 'Use agents, commands and skills from approved coding plugins.',
    publisher: 'SmartEverything',
    capabilities: ['Load approved shared plugin components through the native capability registry'],
    requirements: [
      'Runs on an authorized execution host',
      'Installing preserves existing access and model route restrictions',
    ],
    runtimes: ['smarteverything'],
    platforms: HARNESS_CLAUDE_PLUGINS_METADATA.platforms,
    selection: { kind: 'entry', entry },
    acquisition: { state: 'available', format: 'builtin' },
  });
}

export function claudePluginExtension(
  asset: HarnessSkillAsset,
  display: HarnessSkillPresentation | undefined,
): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: `skill-asset:${asset.id}`,
    kind: 'extension',
    included: false,
    name: display?.name ?? asset.id,
    description: display?.description ?? 'Approved shared coding plugin.',
    publisher: display?.publisher ?? 'Anthropic',
    capabilities: ['Use plugin agents, commands and skills through the native capability registry'],
    requirements: [
      'Coding plugins must be enabled on an authorized execution host',
      'Installing preserves existing access and model route restrictions',
    ],
    runtimes: ['smarteverything'],
    platforms: HARNESS_CLAUDE_PLUGINS_METADATA.platforms,
    selection: { kind: 'skill_asset', parent_id: 'claude-plugins', asset },
    acquisition: { state: 'available', format: 'builtin' },
  });
}
