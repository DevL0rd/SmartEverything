import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  type GithubHarnessSkillSource,
  HarnessSkillAssets,
  decodeSkillAsset,
  githubSkillIdentity,
  officialClaudePlugin,
  officialClaudePluginId,
  inspectHarnessClaudePluginBundle,
  skillSourceChunks,
} from '@smarteverything/harness';
import { HARNESS_SKILL_ASSET, ApiError, type HarnessSkillAsset } from '@smarteverything/domain';
import type { HarnessSkillPresentationsRepository } from '../store/repositories/harness-skill-presentations';

export class ClaudePluginAssets {
  constructor(
    private readonly source: GithubHarnessSkillSource,
    private readonly presentations: HarnessSkillPresentationsRepository,
    private readonly stateDirectory: string | undefined,
  ) {}

  async resolve(
    url: string,
    previous?: HarnessSkillAsset,
    integrity?: string,
  ): Promise<HarnessSkillAsset> {
    const identity = githubSkillIdentity(url);
    const plugin = officialClaudePlugin(identity);
    if (plugin === undefined)
      throw new ApiError('invalid_request', 'Approved plugin source required.');
    const signal = AbortSignal.timeout(30_000);
    const bytes = await this.source.load(url, signal);
    const asset = HARNESS_SKILL_ASSET.parse({
      id: officialClaudePluginId(plugin),
      version: identity.commit,
      source: { kind: 'artifact', url },
      integrity: integrity ?? `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      entrypoint: plugin.entrypoint,
    });
    decodeSkillAsset(asset, bytes);
    if (previous?.id === asset.id && previous.integrity === asset.integrity) return previous;
    const display = await inspectHarnessClaudePluginBundle(asset, bytes, signal);
    if (this.stateDirectory !== undefined) {
      const cache = new HarnessSkillAssets(join(this.stateDirectory, 'shared-skill-assets'), {
        read: (): Promise<AsyncIterable<Uint8Array>> => Promise.resolve(skillSourceChunks(bytes)),
      });
      await cache.acquire(asset, signal);
    }
    this.presentations.keep(asset, { ...display, publisher: 'Anthropic' });
    return asset;
  }
}
