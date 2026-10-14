import type { InstalledHarnessSkillAsset } from './skill-assets';
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill';
import {
  createClaudePluginSkillProvider,
  type PluginSkillEntry,
} from 'dsh-claude-plugin-loader-compat';

export function managedPluginSkills(
  entries: readonly PluginSkillEntry[],
  assets: readonly InstalledHarnessSkillAsset[],
): SkillProvider {
  const upstream = createClaudePluginSkillProvider(entries);
  return {
    name: 'smarteverything-managed-instructions',
    list: async (options): Promise<readonly SkillCandidate[]> => {
      for (const asset of assets) await asset.verify();
      const observed = await upstream.list(options);
      const candidates = 'candidates' in observed ? observed.candidates : observed;
      return candidates.map(neutralCandidate);
    },
    get: async (candidate, options): Promise<SkillDefinition | undefined> => {
      for (const asset of assets) await asset.verify();
      const definition = await upstream.get(candidate, options);
      return definition === undefined ? undefined : neutralDefinition(definition);
    },
  };
}
function neutralCandidate(candidate: SkillCandidate): SkillCandidate {
  return {
    ...candidate,
    provider: 'smarteverything-managed-instructions',
    source: 'SmartEverything',
    metadata: {},
  };
}
function neutralDefinition(definition: SkillDefinition): SkillDefinition {
  return {
    ...definition,
    provider: 'smarteverything-managed-instructions',
    source: 'SmartEverything',
    metadata: {},
  };
}
