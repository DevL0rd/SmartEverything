import { createHash } from 'node:crypto';
import { mkdtemp, opendir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { HARNESS_SKILL_ASSET } from '@smarteverything/domain';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { decodeSkillAsset, MAX_SKILL_ASSET_BYTES } from './skill-asset-format';
import type { HarnessSkillAssetBundle } from './skill-asset-format';
import {
  assertSkillCacheMembers,
  confinedSkillDirectory,
  isMissingSkillCache,
  readSkillCacheFile,
} from './skill-asset-paths';
import { HarnessRuntimeError } from '../host/errors';

const SKILL_ASSET_TIMEOUT_MS = 30_000;
const MAX_SOURCE_CHUNK_BYTES = 64 * 1024;
const MAX_SOURCE_CHUNKS = 16_384;
const MAX_ASSETS_PER_MOUNT = 32;
const MAX_CACHED_ASSETS = 128;

export interface HarnessSkillAssetSource {
  read(asset: HarnessSkillAsset, signal: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
}

export interface InstalledHarnessSkillAsset {
  readonly asset: HarnessSkillAsset;
  readonly directory: string;
  readonly entrypoint: string;
  readonly verify: () => Promise<void>;
}

export class HarnessSkillAssets {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly cacheDirectory: string,
    private readonly source: HarnessSkillAssetSource,
  ) {}

  acquire(input: HarnessSkillAsset, signal?: AbortSignal): Promise<InstalledHarnessSkillAsset> {
    const asset = deepFreeze(HARNESS_SKILL_ASSET.parse(input));
    const bounded =
      signal === undefined
        ? AbortSignal.timeout(SKILL_ASSET_TIMEOUT_MS)
        : AbortSignal.any([signal, AbortSignal.timeout(SKILL_ASSET_TIMEOUT_MS)]);
    const acquired = this.tail.then(() => abortable(this.acquireAsset(asset, bounded), bounded));
    this.tail = acquired.then(
      () => undefined,
      () => undefined,
    );
    return abortable(acquired, bounded);
  }

  async acquireAll(
    assets: readonly HarnessSkillAsset[],
  ): Promise<readonly InstalledHarnessSkillAsset[]> {
    if (assets.length > MAX_ASSETS_PER_MOUNT)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill asset mount exceeds the bounded asset count.',
      );
    const installed: InstalledHarnessSkillAsset[] = [];
    for (const asset of assets) installed.push(await this.acquire(asset));
    return installed;
  }

  private async acquireAsset(
    asset: HarnessSkillAsset,
    signal: AbortSignal,
  ): Promise<InstalledHarnessSkillAsset> {
    signal.throwIfAborted();
    await confinedSkillDirectory(this.cacheDirectory, true);
    const key = createHash('sha256')
      .update(JSON.stringify({ id: asset.id, version: asset.version }))
      .digest('hex');
    const directory = join(this.cacheDirectory, key);
    try {
      await verifyCachedSkillAsset(directory, asset);
    } catch (error) {
      if (!isMissingSkillCache(error)) throw error;
      const bytes = await readSkillAssetSource(this.source, asset, signal);
      const bundle = decodeSkillAsset(asset, bytes);
      signal.throwIfAborted();
      await this.store(directory, { asset, bytes, bundle }, signal);
      await verifyCachedSkillAsset(directory, asset);
    }
    signal.throwIfAborted();
    return {
      asset,
      directory: dirname(join(directory, 'files', asset.entrypoint)),
      entrypoint: join(directory, 'files', asset.entrypoint),
      verify: () => verifyCachedSkillAsset(directory, asset),
    };
  }

  private async store(
    directory: string,
    input: {
      readonly asset: HarnessSkillAsset;
      readonly bytes: Uint8Array;
      readonly bundle: HarnessSkillAssetBundle;
    },
    signal: AbortSignal,
  ): Promise<void> {
    await assertCacheCapacity(this.cacheDirectory);
    signal.throwIfAborted();
    const staging = await mkdtemp(join(this.cacheDirectory, '.incoming-'));
    try {
      await writeFile(join(staging, 'asset.json'), JSON.stringify(input.asset), {
        flag: 'wx',
        mode: 0o400,
      });
      await writeFile(join(staging, 'bundle.json'), input.bytes, { flag: 'wx', mode: 0o400 });
      for (const file of input.bundle.files) {
        signal.throwIfAborted();
        const path = join(staging, 'files', file.path);
        await confinedSkillDirectory(dirname(path), true);
        await writeFile(path, Buffer.from(file.base64, 'base64'), { flag: 'wx', mode: 0o400 });
      }
      signal.throwIfAborted();
      await rename(staging, directory);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}

async function verifyCachedSkillAsset(directory: string, asset: HarnessSkillAsset): Promise<void> {
  await confinedSkillDirectory(directory, false);
  const identity = HARNESS_SKILL_ASSET.parse(
    JSON.parse((await readSkillCacheFile(join(directory, 'asset.json'))).toString('utf8')),
  );
  if (JSON.stringify(identity) !== JSON.stringify(asset))
    throw new HarnessRuntimeError(
      'composition_incompatible',
      `Immutable skill identity ${asset.id}@${asset.version} changed source or content.`,
    );
  const bundle = decodeSkillAsset(asset, await readSkillCacheFile(join(directory, 'bundle.json')));
  await assertSkillCacheMembers(directory, [
    'asset.json',
    'bundle.json',
    ...bundle.files.map((file) => `files/${file.path}`),
  ]);
  for (const file of bundle.files) {
    const cached = await readSkillCacheFile(join(directory, 'files', file.path));
    if (!cached.equals(Buffer.from(file.base64, 'base64')))
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Cached skill ${asset.id}@${asset.version} has changed members.`,
      );
  }
}

async function readSkillAssetSource(
  source: HarnessSkillAssetSource,
  asset: HarnessSkillAsset,
  signal: AbortSignal,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of await source.read(asset, signal)) {
    signal.throwIfAborted();
    if (
      !(chunk instanceof Uint8Array) ||
      chunk.byteLength === 0 ||
      chunk.byteLength > MAX_SOURCE_CHUNK_BYTES ||
      chunks.length >= MAX_SOURCE_CHUNKS
    )
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill asset source must produce bounded byte chunks.',
      );
    size += chunk.byteLength;
    if (size > MAX_SKILL_ASSET_BYTES)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill asset source exceeds the bounded total byte limit.',
      );
    chunks.push(Buffer.from(chunk));
  }
  signal.throwIfAborted();
  return Buffer.concat(chunks);
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => {
      reject(
        new HarnessRuntimeError('operation_failed', 'Skill asset acquisition aborted.', null, {
          cause: signal.reason,
        }),
      );
    };
    signal.addEventListener('abort', aborted, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', aborted);
      })
      .catch(reject);
    if (signal.aborted) aborted();
  });
}

async function assertCacheCapacity(directory: string): Promise<void> {
  let count = 0;
  for await (const _entry of await opendir(directory)) {
    count += 1;
    if (count >= MAX_CACHED_ASSETS)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill cache capacity reached; explicit cache maintenance is required.',
      );
  }
}
