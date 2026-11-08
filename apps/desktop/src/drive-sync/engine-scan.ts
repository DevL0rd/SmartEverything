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
  readonly rootId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
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
  return record === undefined || record.kind === 'folder' || isHashedFile(record);
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
    const { database, rootId } = this.#options;
    const before = this.#tracked();
    for (const rename of batch.renames) database.files.rename(rootId, rename.from, rename.to);
    const result = await this.#scan('targeted');
    this.#apply(result, batch.deleted);
    const targets = batch.renames.map((rename) => rename.to);
    const changed = result.upserts
      .map((input) => input.relPath)
      .filter((path) => !targets.some((target) => isInside(path, target)));
    return this.#intents({ renames: batch.renames, changed, deleted: batch.deleted }, before);
  }

  #tracked(): readonly FileRecord[] {
    return this.#options.database.files
      .list(this.#options.rootId)
      .filter((record) => !isPlaceholder(record));
  }

  async #scan(mode: ScanMode): Promise<ScanResult> {
    const { rootId, rootPath, platform, portablePaths, hasher, ignore, writeQuietMs, log } =
      this.#options;
    await this.#options.settled();
    const result = await scanRoot({
      rootId,
      rootPath,
      previous: this.#tracked(),
      ignore,
      hasher,
      platform,
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
    const { database, rootId } = this.#options;
    database.transaction(() => {
      for (const input of result.upserts) {
        const current = database.files.get(rootId, input.relPath);
        database.files.upsert({ ...input, hubRev: current?.hubRev ?? input.hubRev });
      }
      for (const relPath of removals) database.files.removeSubtree(rootId, relPath);
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

function identityOf(record: FileRecord | undefined): EntryIdentity | undefined {
  if (record === undefined || isPlaceholder(record)) return undefined;
  return { kind: record.kind, bytes: record.bytes, mtimeNs: record.mtimeNs };
}

export function dirtySourceOf(options: {
  readonly rootId: string;
  readonly rootPath: string;
  readonly ignore: IgnoreMatcher;
  readonly database: Pick<DriveSyncDatabase, 'files'>;
}): DirtySource {
  const { database, rootId, rootPath, ignore } = options;
  return {
    probe: statProbe(rootPath),
    known: (path): EntryIdentity | undefined => identityOf(database.files.get(rootId, path)),
    isIgnored: (path): boolean => ignore.isIgnored(path) || isEngineTempName(posix.basename(path)),
  };
}
