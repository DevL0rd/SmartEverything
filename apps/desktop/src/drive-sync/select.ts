import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase, FileInput, FileRecord } from './db/index.js';
import { decode } from './push-queue.js';
import { diskPathFor } from './scan.js';
import { diskStateOf } from './transfer.js';

const NS_PER_MS = 1_000_000n;
const PLACEHOLDER_MODE = 0o644;

export type Wants = (relPath: string) => boolean;

export type ExclusionDatabase = Pick<DriveSyncDatabase, 'exclusions'>;

export type PlaceholderDatabase = Pick<DriveSyncDatabase, 'files' | 'pendingOps'>;

export interface PlaceholderOptions {
  readonly database: PlaceholderDatabase;
  readonly placementId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly log: Logger;
}

export interface ExclusionsApplied {
  readonly kept: readonly string[];
  readonly released: number;
  readonly changed: boolean;
}

function isUnder(relPath: string, folder: string): boolean {
  return folder === '' || relPath === folder || relPath.startsWith(`${folder}/`);
}

export function wantsWithout(excluded: readonly string[]): Wants {
  return (relPath) => !excluded.some((folder) => isUnder(relPath, folder));
}

export function isPlaceholder(record: FileRecord | undefined): boolean {
  return record?.kind === 'file' && record.localHashState === 'unhashed';
}

function pendingPathsOf(database: PlaceholderDatabase): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const op of database.pendingOps.list()) {
    const decoded = decode(op);
    if (decoded.kind === 'move') {
      paths.add(decoded.payload.from);
      paths.add(decoded.payload.to);
    } else {
      paths.add(decoded.payload.relPath);
    }
  }
  return paths;
}

function placeholderOf(placementId: string, entry: SyncIndexEntry): FileInput | null {
  if (entry.kind !== 'file') return null;
  return {
    placementId,
    relPath: entry.relPath,
    kind: 'file',
    bytes: entry.bytes,
    mtimeNs: BigInt(Date.parse(entry.mtime)) * NS_PER_MS,
    mode: PLACEHOLDER_MODE,
    hubRev: entry.rev,
    localHashState: 'unhashed',
    blockSize: null,
    blocks: null,
  };
}

function evictedOf(record: FileRecord): FileInput {
  return {
    placementId: record.placementId,
    relPath: record.relPath,
    kind: 'file',
    bytes: record.bytes,
    mtimeNs: record.mtimeNs,
    mode: record.mode,
    hubRev: record.hubRev,
    localHashState: 'unhashed',
    blockSize: null,
    blocks: null,
  };
}

export class Exclusions {
  readonly #database: ExclusionDatabase;
  readonly #placementId: string;
  #paths: readonly string[];
  #wants: Wants;

  constructor(database: ExclusionDatabase, placementId: string) {
    this.#database = database;
    this.#placementId = placementId;
    this.#paths = database.exclusions.list(placementId);
    this.#wants = wantsWithout(this.#paths);
  }

  get paths(): readonly string[] {
    return this.#paths;
  }

  readonly wants: Wants = (relPath) => this.#wants(relPath);

  replace(paths: readonly string[]): void {
    this.#database.exclusions.replace(this.#placementId, paths);
    this.#paths = this.#database.exclusions.list(this.#placementId);
    this.#wants = wantsWithout(this.#paths);
  }
}

export class Pins {
  constructor(
    private readonly database: Pick<DriveSyncDatabase, 'pins'>,
    private readonly placementId: string,
  ) {}

  get paths(): readonly string[] {
    return this.database.pins.list(this.placementId);
  }

  set(path: string, pinned: boolean): void {
    this.database.pins.set(this.placementId, path, pinned);
  }
}

export class Placeholders {
  readonly #options: PlaceholderOptions;

  constructor(options: PlaceholderOptions) {
    this.#options = options;
  }

  mirror(entries: readonly SyncIndexEntry[], wants: Wants): void {
    const { files } = this.#options.database;
    const { placementId } = this.#options;
    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const existing = files.get(placementId, entry.relPath);
      if (entry.deleted) {
        if (isPlaceholder(existing)) files.remove(placementId, entry.relPath);
        continue;
      }
      const input = placeholderOf(placementId, entry);
      const open = existing === undefined || isPlaceholder(existing);
      if (input !== null && open && !wants(entry.relPath)) files.upsert(input);
    }
  }

  forget(seen: ReadonlySet<string>): void {
    const { files } = this.#options.database;
    const { placementId } = this.#options;
    for (const record of files.list(placementId)) {
      if (isPlaceholder(record) && !seen.has(record.relPath))
        files.remove(placementId, record.relPath);
    }
  }

  async evict(wants: Wants): Promise<readonly string[]> {
    const { database, placementId, rootPath, platform, log } = this.#options;
    const pending = pendingPathsOf(database);
    const kept: string[] = [];
    for (const record of database.files.list(placementId)) {
      const doomed =
        record.kind === 'file' &&
        record.localHashState === 'hashed' &&
        record.hubRev !== null &&
        !wants(record.relPath);
      if (!doomed) continue;
      const disk = diskPathFor(platform, join(rootPath, ...record.relPath.split('/')));
      if (pending.has(record.relPath) || (await diskStateOf(disk, record)) === 'changed') {
        kept.push(record.relPath);
        log.warn('drive_sync.select.kept_local_edit', { placementId, relPath: record.relPath });
        continue;
      }
      await rm(disk, { force: true });
      database.files.upsert(evictedOf(record));
    }
    return kept;
  }

  release(wants: Wants): number {
    const { files } = this.#options.database;
    const { placementId } = this.#options;
    const wanted = files
      .list(placementId)
      .filter((record) => isPlaceholder(record) && wants(record.relPath));
    for (const record of wanted) files.remove(placementId, record.relPath);
    return wanted.length;
  }

  downloadBytes(wants: Wants): number {
    const { files } = this.#options.database;
    return files
      .list(this.#options.placementId)
      .filter((record) => isPlaceholder(record) && wants(record.relPath))
      .reduce((sum, record) => sum + record.bytes, 0);
  }
}

export async function applyExclusions(
  exclusions: Exclusions,
  placeholders: Placeholders,
  paths: readonly string[],
): Promise<ExclusionsApplied> {
  const before = exclusions.paths;
  exclusions.replace(paths);
  const after = exclusions.paths;
  const changed = before.length !== after.length || before.some((path, at) => path !== after[at]);
  const kept = await placeholders.evict(exclusions.wants);
  const released = placeholders.release(exclusions.wants);
  return { kept, released, changed };
}
