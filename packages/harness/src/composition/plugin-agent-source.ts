import type { InstalledHarnessSkillAsset } from './skill-assets';
import { loadPlugin, type ClaudeAgentFile } from './claude-plugin-manifest';
import { HarnessRuntimeError } from '../host/errors';

export async function readHarnessPluginAgent(
  installed: InstalledHarnessSkillAsset,
  name: string,
): Promise<ClaudeAgentFile> {
  const plugin = await loadPlugin(installed.directory);
  const helper = plugin.components.agents.find((candidate) => candidate.name === name);
  if (helper === undefined)
    throw new HarnessRuntimeError('capability_unsupported', `The package has no helper ${name}.`);
  return helper;
}
