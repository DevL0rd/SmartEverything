import { mkdir, mkdtemp, readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessExtensionTree, HarnessSkillAsset } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import { harnessTreeHash, writeHarnessTree } from './extension-tree';

const UNUSED_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const INCOMING = '.incoming-';

export type HarnessExtensionKind = 'skill' | 'plugin';

export interface HarnessSkillAssetSource {
  read(kind: HarnessExtensionKind, asset: HarnessSkillAsset): Promise<HarnessExtensionTree>;
}

export interface InstalledHarnessSkillAsset {
  readonly asset: HarnessSkillAsset;
  readonly directory: string;
}

export class HarnessSkillAssets {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly cacheDirectory: string,
    private readonly source: HarnessSkillAssetSource,
  ) {}

  async acquireAll(
    kind: HarnessExtensionKind,
    assets: readonly HarnessSkillAsset[],
  ): Promise<readonly InstalledHarnessSkillAsset[]> {
    await mkdir(this.cacheDirectory, { recursive: true });
    const installed: InstalledHarnessSkillAsset[] = [];
    for (const asset of assets)
      installed.push({ asset, directory: await this.directoryOf(kind, asset) });
    await this.prune(new Set(installed.map((entry) => entry.asset.version)));
    return installed;
  }

  private async directoryOf(kind: HarnessExtensionKind, asset: HarnessSkillAsset): Promise<string> {
    const directory = join(this.cacheDirectory, asset.version);
    const fetching = this.pending.get(asset.version);
    if (fetching !== undefined) await fetching;
    else if (await exists(directory)) await utimes(directory, new Date(), new Date());
    else {
      const work = this.fetch(kind, asset, directory).finally(() => {
        this.pending.delete(asset.version);
      });
      this.pending.set(asset.version, work);
      await work;
    }
    return directory;
  }

  private async fetch(
    kind: HarnessExtensionKind,
    asset: HarnessSkillAsset,
    directory: string,
  ): Promise<void> {
    const tree = await this.source.read(kind, asset);
    if (harnessTreeHash(tree) !== asset.version)
      throw new HarnessRuntimeError(
        'operation_failed',
        `${kind} ${asset.id} changed on the Home Hub while it was being fetched; it will sync again.`,
      );
    const staging = await mkdtemp(join(this.cacheDirectory, INCOMING));
    try {
      await writeHarnessTree(staging, tree);
      await rename(staging, directory);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private async prune(live: ReadonlySet<string>): Promise<void> {
    const cutoff = Date.now() - UNUSED_CACHE_MS;
    for (const name of await readdir(this.cacheDirectory)) {
      if (live.has(name)) continue;
      const path = join(this.cacheDirectory, name);
      if ((await stat(path)).mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
    }
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}
