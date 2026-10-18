import type { HarnessExtensionTree, HarnessSkillAsset } from '@smarteverything/domain';
import { desiredHarnessConfiguration } from '../../src/composition/builtins';
import type { HarnessDesiredEntry } from '../../src/composition/configuration';
import { harnessTreeHash } from '../../src/composition/extension-tree';
import type {
  HarnessExtensionKind,
  HarnessSkillAssetSource,
} from '../../src/composition/skill-assets';

export interface ExtensionFixture {
  readonly asset: HarnessSkillAsset;
  readonly tree: HarnessExtensionTree;
}

function extensionFixture(
  kind: HarnessExtensionKind,
  name: string,
  files: Readonly<Record<string, string>>,
  executes = false,
): ExtensionFixture {
  const manifest = { '.claude-plugin/plugin.json': JSON.stringify({ name }) };
  const tree = {
    files: Object.entries(kind === 'plugin' ? { ...manifest, ...files } : files).map(
      ([path, content]) => ({ path, base64: Buffer.from(content).toString('base64') }),
    ),
  };
  return { tree, asset: { id: `${kind}:${name}`, version: harnessTreeHash(tree), executes } };
}

export function pluginFixture(
  name: string,
  files: Readonly<Record<string, string>>,
  executes = false,
): ExtensionFixture {
  return extensionFixture('plugin', name, files, executes);
}

export function skillFixture(name: string, markdown: string): ExtensionFixture {
  return extensionFixture('skill', name, { 'SKILL.md': markdown });
}

export function extensionSource(fixtures: readonly ExtensionFixture[]): HarnessSkillAssetSource {
  return {
    read: (_kind, asset): Promise<HarnessExtensionTree> => {
      const fixture = fixtures.find((entry) => entry.asset.id === asset.id);
      if (fixture === undefined) return Promise.reject(new Error(`No files for ${asset.id}.`));
      return Promise.resolve(fixture.tree);
    },
  };
}

export function builtinEntry(
  id: 'skills' | 'claude-plugins',
  fixtures: readonly ExtensionFixture[] = [],
): HarnessDesiredEntry {
  const assets = fixtures.map((fixture) => fixture.asset);
  const entry = desiredHarnessConfiguration(
    id === 'skills' ? { skills: assets } : { plugins: assets },
  ).entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`No built-in ${id}.`);
  return entry;
}
