import { join } from 'node:path';
import { HarnessSkillAssets } from '@smarteverything/harness';
import { createHash } from 'node:crypto';
import {
  ApiError,
  HARNESS_EXTENSION_ITEM,
  HARNESS_SKILL_ASSET,
  HARNESS_SKILL_IMPORT_FORMATS,
  HARNESS_SKILL_RESOLVE,
  type AiHarnessExtensions,
  type HarnessDesiredEntry,
  type HarnessExtensionItem,
  type HarnessSkillAsset,
} from '@smarteverything/domain';
import {
  GithubHarnessSkillSource,
  decodeSkillAsset,
  githubSkillIdentity,
  harnessSkillExtension,
  includedHarnessExtensions,
  bundledHarnessSkills,
  inspectHarnessSkillBundle,
  HarnessRuntimeError,
} from '@smarteverything/harness';
import type { HarnessConfigurationService } from './configuration';
import {
  HarnessSkillPresentationStorageError,
  type HarnessSkillPresentationsRepository,
} from '../store/repositories/harness-skill-presentations';

const RESOLVE_TIMEOUT_MS = 30_000;

export class HarnessExtensions {
  private readonly source = new GithubHarnessSkillSource();

  constructor(
    private readonly configuration: HarnessConfigurationService,
    private readonly presentations: HarnessSkillPresentationsRepository,
    private readonly stateDirectory?: string,
  ) {}

  catalogue(): AiHarnessExtensions {
    const desired = this.configuration.desired();
    const included = includedHarnessExtensions();
    const skills = desired.entries.find((entry) => entry.id === 'skills');
    const added = desired.entries.filter((entry) => !included.some((item) => item.id === entry.id));
    return {
      items: [
        ...included,
        ...(skills?.metadata?.skill_assets.map((asset) =>
          harnessSkillExtension(asset, this.presentations.read(asset)),
        ) ?? []),
        ...added.map(unavailableExtension),
      ],
      bundled_skills: bundledHarnessSkills(),
      import_formats: [...HARNESS_SKILL_IMPORT_FORMATS],
    };
  }

  async resolve(
    input: unknown,
    role: 'owner' | 'member',
    previous?: HarnessSkillAsset,
  ): Promise<HarnessExtensionItem> {
    if (role !== 'owner')
      throw new ApiError('forbidden', 'Only an owner may inspect shared skill sources.');
    const request = HARNESS_SKILL_RESOLVE.parse(input);
    if (request.url.endsWith('.json') && request.integrity === undefined)
      throw new ApiError(
        'invalid_request',
        'JSON skill bundles require the publisher’s pinned SHA integrity.',
      );
    try {
      return await this.inspect(request.url, request.integrity, previous);
    } catch (cause) {
      if (cause instanceof HarnessSkillPresentationStorageError)
        throw new ApiError('conflict', cause.reason);
      throw new ApiError(
        'invalid_request',
        cause instanceof HarnessRuntimeError
          ? cause.message
          : 'Source inspection failed. Expected a readable bounded immutable skill with valid SKILL.md metadata.',
      );
    }
  }

  private async inspect(
    url: string,
    integrity: string | undefined,
    previous: HarnessSkillAsset | undefined,
  ): Promise<HarnessExtensionItem> {
    const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
    const bytes = await this.source.load(url, signal);
    const asset = pinnedSkillAsset(url, integrity, bytes);
    decodeSkillAsset(asset, bytes);
    if (previous?.id === asset.id && previous.integrity === asset.integrity)
      return harnessSkillExtension(previous, this.presentations.read(previous));
    const display = await inspectHarnessSkillBundle(asset, bytes, signal);
    if (this.stateDirectory !== undefined) {
      const cache = new HarnessSkillAssets(join(this.stateDirectory, 'shared-skill-assets'), {
        read: (): Promise<AsyncIterable<Uint8Array>> => Promise.resolve(skillChunks(bytes)),
      });
      await cache.acquire(asset, signal);
    }
    const identity = githubSkillIdentity(url);
    const presentation = this.presentations.keep(asset, {
      ...display,
      publisher: `${identity.owner}/${identity.repository}`,
    });
    return harnessSkillExtension(asset, presentation);
  }
}

function pinnedSkillAsset(
  url: string,
  integrity: string | undefined,
  bytes: Uint8Array,
): HarnessSkillAsset {
  const identity = githubSkillIdentity(url);
  const id = createHash('sha256')
    .update(`${identity.owner}/${identity.repository}/${identity.path}`)
    .digest('hex');
  return HARNESS_SKILL_ASSET.parse({
    id: `github-skill:${id}`,
    version: identity.commit,
    source: { kind: 'artifact', url },
    integrity: integrity ?? `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
    entrypoint: 'SKILL.md',
  });
}

function unavailableExtension(entry: HarnessDesiredEntry): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: entry.id,
    kind: 'extension',
    included: false,
    name: entry.id,
    description: 'Pinned shared selection. This version has no supported acquisition adapter.',
    publisher: entry.package,
    capabilities: [],
    requirements: ['A registered compatible extension adapter is required'],
    runtimes: [],
    platforms: entry.metadata?.platforms ?? [],
    selection: { kind: 'entry', entry },
    acquisition: {
      state: 'unsupported',
      reason:
        'Arbitrary packages and native Claude Code or Codex plugin bundles cannot be installed or converted by this runtime.',
    },
  });
}

async function* skillChunks(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  const chunkBytes = 64 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes)
    yield await Promise.resolve(bytes.subarray(offset, offset + chunkBytes));
}
