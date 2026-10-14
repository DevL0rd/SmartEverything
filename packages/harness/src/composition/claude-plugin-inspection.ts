import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import { loadPlugin } from 'dsh-claude-plugin-loader-compat';
import { HarnessSkillAssets } from './skill-assets';
import { skillSourceChunks } from './github-skill-source';
import {
  officialClaudePlugin,
  officialClaudePluginId,
  type OfficialClaudePlugin,
} from './github-plugin-bundle';
import { githubSkillIdentity } from './github-skill-bundle';
import { HarnessRuntimeError } from '../host/errors';

export async function inspectHarnessClaudePluginBundle(
  asset: HarnessSkillAsset,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<{ readonly name: string; readonly description: string }> {
  const approved = approvedHarnessPluginAsset(asset);
  const temporary = await mkdtemp(join(tmpdir(), 'smarteverything-plugin-inspect-'));
  try {
    const cache = new HarnessSkillAssets(join(temporary, 'assets'), {
      read: (): Promise<AsyncIterable<Uint8Array>> => Promise.resolve(skillSourceChunks(bytes)),
    });
    const acquired = await cache.acquire(asset, signal);
    const root = pluginRoot(acquired.entrypoint, asset.entrypoint);
    const plugin = loadPlugin(root);
    signal.throwIfAborted();
    if (plugin.metadata.name !== approved.name)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'The plugin manifest differs from its approved identity.',
      );
    return {
      name: plugin.metadata.name,
      description:
        plugin.metadata.description ?? `Tools and instructions for ${plugin.metadata.name}.`,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function pluginRoot(entrypoint: string, relative: string): string {
  let root = entrypoint;
  for (const _part of relative.split('/')) root = dirname(root);
  return root;
}

export function approvedHarnessPluginAsset(asset: HarnessSkillAsset): OfficialClaudePlugin {
  if (
    asset.source.kind !== 'artifact' ||
    new URL(asset.source.url).hostname !== 'raw.githubusercontent.com'
  )
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'A managed package requires its pinned official source.',
    );
  const identity = githubSkillIdentity(asset.source.url);
  const approved = officialClaudePlugin(identity);
  if (
    asset.entrypoint !== approved?.entrypoint ||
    asset.id !== officialClaudePluginId(approved) ||
    asset.version !== identity.commit ||
    !/^[a-f0-9]{40}$/u.test(identity.commit)
  )
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'Managed package source, version or entrypoint is not approved.',
    );
  return approved;
}
