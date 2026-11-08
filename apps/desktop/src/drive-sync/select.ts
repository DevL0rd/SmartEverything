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

export type SelectionDatabase = Pick<DriveSyncDatabase, 'selections'>;

export type PlaceholderDatabase = Pick<DriveSyncDatabase, 'files' | 'pendingOps'>;

export interface PlaceholderOptions {
  readonly database: PlaceholderDatabase;
  readonly rootId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly log: Logger;
}

export interface SelectionApplied {
  readonly kept: readonly string[];
  readonly released: number;
}

function isUnder(relPath: string, folder: string): boolean {
  return folder === '' || relPath === folder || relPath.startsWith(`${folder}/`);
}

export function wantsFrom(selected: readonly string[]): Wants {
  return (relPath) => selected.length === 0 || selected.some((folder) => isUnder(relPath, folder));
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

function placeholderOf(rootId: string, entry: SyncIndexEntry): FileInput | null {
  if (entry.kind !== 'file') return null;
  return {
    rootId,
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
    rootId: record.rootId,
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

export class Selection {
  readonly #database: SelectionDatabase;
  readonly #rootId: string;
  #paths: readonly string[];
  #wants: Wants;

  constructor(database: SelectionDatabase, rootId: string) {
    this.#database = database;
    this.#rootId = rootId;
    this.#paths = database.selections.list(rootId);
    this.#wants = wantsFrom(this.#paths);
  }

  get paths(): readonly string[] {
    return this.#paths;
  }

  readonly wants: Wants = (relPath) => this.#wants(relPath);

  replace(paths: readonly string[]): void {
    this.#database.selections.replace(this.#rootId, paths);
    this.#paths = this.#database.selections.list(this.#rootId);
    this.#wants = wantsFrom(this.#paths);
  }
}

export class Pins {
  constructor(
    private readonly database: Pick<DriveSyncDatabase, 'pins'>,
    private readonly rootId: string,
  ) {}

  get paths(): readonly string[] {
    return this.database.pins.list(this.rootId);
  }

  set(path: string, pinned: boolean): void {
    this.database.pins.set(this.rootId, path, pinned);
  }
}

export class Placeholders {
  readonly #options: PlaceholderOptions;

  constructor(options: PlaceholderOptions) {
    this.#options = options;
  }

  mirror(entries: readonly SyncIndexEntry[], wants: Wants): void {
    const { files } = this.#options.database;
    const { rootId } = this.#options;
    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const existing = files.get(rootId, entry.relPath);
      if (entry.deleted) {
        if (isPlaceholder(existing)) files.remove(rootId, entry.relPath);
        continue;
      }
      const input = placeholderOf(rootId, entry);
      const open = existing === undefined || isPlaceholder(existing);
      if (input !== null && open && !wants(entry.relPath)) files.upsert(input);
    }
  }

  forget(seen: ReadonlySet<string>): void {
    const { files } = this.#options.database;
    const { rootId } = this.#options;
    for (const record of files.list(rootId)) {
      if (isPlaceholder(record) && !seen.has(record.relPath)) files.remove(rootId, record.relPath);
    }
  }

  async evict(wants: Wants): Promise<readonly string[]> {
    const { database, rootId, rootPath, platform, log } = this.#options;
    const pending = pendingPathsOf(database);
    const kept: string[] = [];
    for (const record of database.files.list(rootId)) {
      const doomed =
        record.kind === 'file' &&
        record.localHashState === 'hashed' &&
        record.hubRev !== null &&
        !wants(record.relPath);
      if (!doomed) continue;
      const disk = diskPathFor(platform, join(rootPath, ...record.relPath.split('/')));
      if (pending.has(record.relPath) || (await diskStateOf(disk, record)) === 'changed') {
        kept.push(record.relPath);
        log.warn('drive_sync.select.kept_local_edit', { rootId, relPath: record.relPath });
        continue;
      }
      await rm(disk, { force: true });
      database.files.upsert(evictedOf(record));
    }
    return kept;
  }

  release(wants: Wants): number {
    const { files } = this.#options.database;
    const { rootId } = this.#options;
    const wanted = files
      .list(rootId)
      .filter((record) => isPlaceholder(record) && wants(record.relPath));
    for (const record of wanted) files.remove(rootId, record.relPath);
    return wanted.length;
  }

  downloadBytes(wants: Wants): number {
    const { files } = this.#options.database;
    return files
      .list(this.#options.rootId)
      .filter((record) => isPlaceholder(record) && wants(record.relPath))
      .reduce((sum, record) => sum + record.bytes, 0);
  }
}
