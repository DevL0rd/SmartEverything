import { HARNESS_SKILL_SOURCE_URL } from '@smarteverything/domain';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import { HarnessSkillAssets, type HarnessSkillAssetSource } from './skill-assets';
import { join } from 'node:path';
import { MAX_SKILL_ASSET_BYTES } from './skill-asset-format';
import { readSkillSourceHttp } from './skill-source-http';
import { githubSkillBundle, githubSkillIdentity } from './github-skill-bundle';
import { HarnessRuntimeError } from '../host/errors';
import { githubPluginBundle, officialClaudePlugin } from './github-plugin-bundle';

const SOURCE_CHUNK_BYTES = 64 * 1024;

export function sharedHarnessSkillAssets(stateDirectory: string): HarnessSkillAssets {
  return new HarnessSkillAssets(
    join(stateDirectory, 'shared-skill-assets'),
    new GithubHarnessSkillSource(),
  );
}

export class GithubHarnessSkillSource implements HarnessSkillAssetSource {
  async load(url: string, signal: AbortSignal): Promise<Buffer> {
    const source = HARNESS_SKILL_SOURCE_URL.parse(url);
    const identity = githubSkillIdentity(source);
    const plugin = officialClaudePlugin(identity);
    if (plugin !== undefined) return githubPluginBundle(identity, plugin, signal);
    if (identity.path.endsWith('SKILL.md')) return githubSkillBundle(identity, signal);
    return readSkillSourceHttp(source, MAX_SKILL_ASSET_BYTES, signal);
  }

  async read(asset: HarnessSkillAsset, signal: AbortSignal): Promise<AsyncIterable<Uint8Array>> {
    if (asset.source.kind !== 'artifact')
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Shared skill acquisition requires a supported pinned artifact source.',
      );
    return skillSourceChunks(await this.load(asset.source.url, signal));
  }
}

export async function* skillSourceChunks(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += SOURCE_CHUNK_BYTES)
    yield await Promise.resolve(bytes.subarray(offset, offset + SOURCE_CHUNK_BYTES));
}
