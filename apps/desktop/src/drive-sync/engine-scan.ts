import type { IgnoreMatcher } from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import type { BlockHasher } from './blocks.js';
import type { DriveSyncDatabase, FileRecord } from './db/index.js';
import { posix } from 'node:path';
import {
  withoutDescendants,
  type DirtyBatch,
  type DirtySource,
  type EntryIdentity,
} from './dirty.js';
import type { MetaPort } from './meta-port.js';
import { fileViewOf, isHashedFile, pushIntents, type PushIntent } from './push-intents.js';
import {
  isEngineTempName,
  scanRoot,
  volumeMtimeToleranceNs,
  type ScanResult,
  type ScanSkip,
} from './scan.js';
import { isPlaceholder } from './select.js';
import { statProbe } from './watch.js';

export interface TreeScannerOptions {
  readonly placementId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly meta: MetaPort;
  readonly portablePaths: boolean;
  readonly database: Pick<DriveSyncDatabase, 'files' | 'transaction'>;
  readonly hasher: BlockHasher;
  readonly ignore: IgnoreMatcher;
  readonly writeQuietMs: number;
  readonly settled: () => Promise<void>;
  readonly skipped: (skips: readonly ScanSkip[]) => void;
  readonly log: Logger;
}

type ScanMode = 'full' | 'targeted';

function isReady(record: FileRecord | undefined): boolean {
  return record?.kind !== 'file' || isHashedFile(record);
}

function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export class TreeScanner {
  readonly #options: TreeScannerOptions;
  #tolerance = 0n;

  constructor(options: TreeScannerOptions) {
    this.#options = options;
  }

  get toleranceNs(): bigint {
    return this.#tolerance;
  }

  async prepare(): Promise<void> {
    this.#tolerance = await volumeMtimeToleranceNs(this.#options.rootPath);
  }

  async full(): Promise<readonly PushIntent[]> {
    const before = this.#tracked();
    const result = await this.#scan('full');
    const removals = withoutDescendants(result.removed);
    this.#apply(result, removals);
    return this.#intents(
      { renames: [], changed: result.upserts.map((input) => input.relPath), deleted: removals },
      before,
    );
  }

  async batch(batch: DirtyBatch): Promise<readonly PushIntent[]> {
    const { database, placementId } = this.#options;
    const before = this.#tracked();
    for (const rename of batch.renames) database.files.rename(placementId, rename.from, rename.to);
    const result = await this.#scan('targeted');
    const deleted = withoutDescendants([...batch.deleted, ...vanishedLinks(before, result)]);
    this.#apply(result, deleted);
    const targets = batch.renames.map((rename) => rename.to);
    const changed = result.upserts
      .map((input) => input.relPath)
      .filter((path) => !targets.some((target) => isInside(path, target)));
    return this.#intents({ renames: batch.renames, changed, deleted }, before);
  }

  #tracked(): readonly FileRecord[] {
    return this.#options.database.files
      .list(this.#options.placementId)
      .filter((record) => !isPlaceholder(record));
  }

  async #scan(mode: ScanMode): Promise<ScanResult> {
    const {
      placementId,
      rootPath,
      platform,
      meta,
      portablePaths,
      hasher,
      ignore,
      writeQuietMs,
      log,
    } = this.#options;
    await this.#options.settled();
    const result = await scanRoot({
      placementId,
      rootPath,
      previous: this.#tracked(),
      ignore,
      hasher,
      platform,
      meta,
      portablePaths,
      mtimeToleranceNs: this.#tolerance,
      quietMs: mode === 'full' ? writeQuietMs : 0,
      now: () => Date.now(),
      log,
    });
    if (result.skipped.length > 0) this.#options.skipped(result.skipped);
    return result;
  }

  #apply(result: ScanResult, removals: readonly string[]): void {
    const { database, placementId } = this.#options;
    database.transaction(() => {
      for (const input of result.upserts) {
        const current = database.files.get(placementId, input.relPath);
        database.files.upsert({
          ...input,
          hubRev: current?.hubRev ?? input.hubRev,
          hubInode: current?.hubInode ?? input.hubInode,
        });
      }
      for (const relPath of removals) database.files.removeSubtree(placementId, relPath);
    });
  }

  #intents(batch: DirtyBatch, before: readonly FileRecord[]): readonly PushIntent[] {
    const after = fileViewOf(this.#tracked());
    return pushIntents(
      { ...batch, changed: batch.changed.filter((path) => isReady(after.get(path))) },
      fileViewOf(before),
      after,
    );
  }
}

function vanishedLinks(before: readonly FileRecord[], result: ScanResult): readonly string[] {
  const links = new Set(before.filter((record) => record.kind === 'link').map((r) => r.relPath));
  const upserted = new Set(result.upserts.map((input) => input.relPath));
  return result.removed.filter((path) => links.has(path) && !upserted.has(path));
}

function identityOf(record: FileRecord | undefined): EntryIdentity | undefined {
  if (record === undefined || isPlaceholder(record)) return undefined;
  return {
    kind: record.kind,
    bytes: record.bytes,
    mtimeNs: record.mtimeNs,
  };
}

export function dirtySourceOf(options: {
  readonly placementId: string;
  readonly rootPath: string;
  readonly ignore: IgnoreMatcher;
  readonly database: Pick<DriveSyncDatabase, 'files'>;
}): DirtySource {
  const { database, placementId, rootPath, ignore } = options;
  return {
    probe: statProbe(rootPath),
    known: (path): EntryIdentity | undefined => identityOf(database.files.get(placementId, path)),
    isIgnored: (path): boolean => ignore.isIgnored(path) || isEngineTempName(posix.basename(path)),
  };
}
