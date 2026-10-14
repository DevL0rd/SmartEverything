import {
  loadPlugin,
  hasInterpolationGroup,
  parseMarkdownFile,
  type ClaudeAgentFile,
} from 'dsh-claude-plugin-loader-compat';
import { readFile } from 'node:fs/promises';
import type { InstalledHarnessSkillAsset } from './skill-assets';
import { pluginRoot } from './claude-plugin-inspection';
import { HarnessRuntimeError } from '../host/errors';

export async function readHarnessPluginAgent(
  installed: InstalledHarnessSkillAsset,
  name: string,
): Promise<ClaudeAgentFile> {
  await installed.verify();
  const helper = loadPlugin(
    pluginRoot(installed.entrypoint, installed.asset.entrypoint),
  ).components.agents.find((candidate) => candidate.name === name);
  if (helper === undefined || hasInterpolationGroup(helper.body))
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The verified helper is absent or requires unsupported persona interpolation.',
    );
  const parsed = parseMarkdownFile(await readFile(helper.path, 'utf8'), helper.path);
  const supported = new Set(['name', 'description', 'model', 'tools', 'color']);
  if (Object.keys(parsed.frontmatter).some((key) => !supported.has(key)))
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'This helper requires unsupported frontmatter semantics.',
    );
  return helper;
}
