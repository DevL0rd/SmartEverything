import { lstatSync, opendirSync, readlinkSync, type BigIntStats, type Dir } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { z } from 'zod';
import { LOCKED_FOLDER } from './access';
import { ORPHAN_DIRECTORY } from './paths';

export const WALK_BATCH_ROWS = 1000;
export const BATCHES_IN_FLIGHT = 2;
export const UNRESPONSIVE_AFTER_MS = 2000;

export const CONTROL_ACKED = 0;
export const CONTROL_CALL = 1;
export const CONTROL_SLOTS = 2;

const COUNT = z.int().nonnegative();
const DIGITS = z.string().regex(/^\d+$/);

const IDENTITY = {
  relPath: z.string().min(1),
  name: z.string().min(1),
  parentRelPath: z.string().min(1).nullable(),
  bytes: COUNT,
  modifiedMs: z.number().nonnegative(),
  mtimeNs: DIGITS,
  mode: z.int().min(0).max(0o7777),
  dev: DIGITS,
  ino: DIGITS,
};

interface EntryIdentity {
  readonly relPath: string;
  readonly name: string;
  readonly parentRelPath: string | null;
  readonly bytes: number;
  readonly modifiedMs: number;
  readonly mtimeNs: string;
  readonly mode: number;
  readonly dev: string;
  readonly ino: string;
}

export const SPECIAL_KINDS = ['fifo', 'socket', 'char', 'block'] as const;

export type SpecialKind = (typeof SPECIAL_KINDS)[number];

export const WALK_ENTRY = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...IDENTITY, kind: z.literal('file'), nlink: z.int().positive() }),
    z.strictObject({ ...IDENTITY, kind: z.literal('folder'), childCount: COUNT.nullable() }),
    z.strictObject({ ...IDENTITY, kind: z.literal('link'), target: z.string().min(1) }),
    z.strictObject({
      ...IDENTITY,
      kind: z.literal('special'),
      special: z.enum(SPECIAL_KINDS),
      rdev: COUNT,
    }),
  ])
  .readonly();

export type WalkEntry = z.infer<typeof WALK_ENTRY>;

export const WALK_DATA = z.strictObject({
  path: z.string().min(1),
  includeHidden: z.boolean(),
  skip: z.array(z.string().min(1)).readonly(),
  reserved: z.array(z.string().min(1)).readonly(),
  control: z.instanceof(SharedArrayBuffer),
  origin: z.number(),
});

export type WalkData = z.infer<typeof WALK_DATA>;

export const WALK_MESSAGE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('batch'),
    sequence: z.int().positive(),
    entries: z.array(WALK_ENTRY),
  }),
  z.strictObject({ kind: z.literal('problem'), relPath: z.string(), code: z.string().min(1) }),
  z.strictObject({ kind: z.literal('done'), skipped: COUNT }),
  z.strictObject({ kind: z.literal('failed'), message: z.string().min(1) }),
]);

export type WalkMessage = z.infer<typeof WALK_MESSAGE>;

export interface WalkSink {
  readonly batch: (sequence: number, entries: readonly WalkEntry[]) => void;
  readonly problem: (relPath: string, code: string) => void;
}

export interface WalkResult {
  readonly skipped: number;
}

interface Folder {
  readonly relPath: string;
  readonly absolute: string;
  readonly parentRelPath: string | null;
  readonly stats: BigIntStats;
}

interface Listing {
  readonly files: readonly WalkEntry[];
  readonly folders: readonly Folder[];
  readonly childCount: number;
  readonly bytes: number;
  readonly skipped: number;
}

function codeOf(cause: unknown): string {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : 'UNKNOWN';
}

export class CallClock {
  constructor(
    private readonly control: Int32Array,
    private readonly origin: number,
  ) {}

  around<T>(call: () => T): T {
    Atomics.store(this.control, CONTROL_CALL, Date.now() - this.origin + 1);
    try {
      return call();
    } finally {
      Atomics.store(this.control, CONTROL_CALL, 0);
    }
  }

  static stuckForMs(control: Int32Array, origin: number): number {
    const since = Atomics.load(control, CONTROL_CALL);
    return since === 0 ? 0 : Date.now() - origin + 1 - since;
  }
}

function modeOf(stats: BigIntStats): number {
  return Number(stats.mode & 0o7777n);
}

function specialOf(stats: BigIntStats): SpecialKind | null {
  if (stats.isFIFO()) return 'fifo';
  if (stats.isSocket()) return 'socket';
  if (stats.isCharacterDevice()) return 'char';
  if (stats.isBlockDevice()) return 'block';
  return null;
}

function isSkipped(patterns: readonly string[], relPath: string, name: string): boolean {
  return patterns.some(
    (pattern) =>
      matchesGlob(relPath, pattern) || (!pattern.includes('/') && matchesGlob(name, pattern)),
  );
}

function childPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}

class Walker {
  private readonly clock: CallClock;
  private buffer: WalkEntry[] = [];
  private sequence = 0;
  private skippedUnknown = 0;

  constructor(
    private readonly data: WalkData,
    private readonly sink: WalkSink,
    private readonly control: Int32Array,
  ) {
    this.clock = new CallClock(control, data.origin);
  }

  run(): WalkResult {
    const rootStats = this.clock.around(() => lstatSync(this.data.path, { bigint: true }));
    const pending: Folder[] = [
      { relPath: '', absolute: this.data.path, parentRelPath: null, stats: rootStats },
    ];
    for (let folder = pending.pop(); folder !== undefined; folder = pending.pop()) {
      pending.push(...[...this.visit(folder)].reverse());
    }
    this.flush();
    return { skipped: this.skippedUnknown };
  }

  private visit(folder: Folder): readonly Folder[] {
    const root = folder.relPath === '';
    const listing = this.list(folder, root);
    if (listing === null) {
      this.add(this.folderEntry(folder, null, 0));
      return [];
    }
    if (!root) {
      this.add(this.folderEntry(folder, listing.childCount, listing.bytes));
    }
    for (const file of listing.files) this.add(file);
    this.skippedUnknown += listing.skipped;
    return listing.folders;
  }

  private folderEntry(folder: Folder, childCount: number | null, bytes: number): WalkEntry {
    return {
      kind: 'folder',
      relPath: folder.relPath,
      name: folder.relPath.slice(folder.relPath.lastIndexOf('/') + 1),
      parentRelPath: folder.parentRelPath,
      bytes,
      modifiedMs: Number(folder.stats.mtimeMs),
      mtimeNs: folder.stats.mtimeNs.toString(),
      mode: modeOf(folder.stats),
      dev: folder.stats.dev.toString(),
      ino: folder.stats.ino.toString(),
      childCount,
    };
  }

  private add(entry: WalkEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= WALK_BATCH_ROWS) this.flush();
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    this.waitForRoom();
    this.sequence += 1;
    this.sink.batch(this.sequence, this.buffer);
    this.buffer = [];
  }

  private waitForRoom(): void {
    for (
      let acked = Atomics.load(this.control, CONTROL_ACKED);
      this.sequence - acked >= BATCHES_IN_FLIGHT;
      acked = Atomics.load(this.control, CONTROL_ACKED)
    ) {
      Atomics.wait(this.control, CONTROL_ACKED, acked);
    }
  }

  private list(folder: Folder, root: boolean): Listing | null {
    let directory: Dir;
    try {
      directory = this.clock.around(() => opendirSync(folder.absolute));
    } catch (cause) {
      if (root) throw cause;
      this.sink.problem(folder.relPath, codeOf(cause));
      return null;
    }
    try {
      return this.read(directory, folder, root);
    } catch (cause) {
      this.sink.problem(folder.relPath, codeOf(cause));
      return null;
    } finally {
      this.clock.around(() => {
        directory.closeSync();
      });
    }
  }

  private read(directory: Dir, folder: Folder, root: boolean): Listing {
    const files: WalkEntry[] = [];
    const folders: Folder[] = [];
    let bytes = 0;
    let unknown = 0;
    for (
      let item = this.clock.around(() => directory.readSync());
      item !== null;
      item = this.clock.around(() => directory.readSync())
    ) {
      const name = item.name;
      const relPath = childPath(folder.relPath, name);
      if (this.excluded(name, relPath, root)) continue;
      const stats = this.stat(join(folder.absolute, name), relPath);
      if (stats === null) continue;
      if (stats.isDirectory()) {
        folders.push({
          relPath,
          absolute: join(folder.absolute, name),
          parentRelPath: folder.relPath === '' ? null : folder.relPath,
          stats,
        });
      } else if (stats.isFile()) {
        bytes += Number(stats.size);
        files.push(this.fileEntry(folder, name, relPath, stats));
      } else {
        const entry = this.otherEntry(folder, name, relPath, stats);
        if (entry === null) unknown += 1;
        else files.push(entry);
      }
    }
    return { files, folders, childCount: files.length + folders.length, bytes, skipped: unknown };
  }

  private excluded(name: string, relPath: string, root: boolean): boolean {
    if (root && (this.data.reserved.includes(name) || name === ORPHAN_DIRECTORY)) return true;
    if (!this.data.includeHidden && name.startsWith('.') && !(root && name === LOCKED_FOLDER)) {
      return true;
    }
    return isSkipped(this.data.skip, relPath, name);
  }

  private stat(absolute: string, relPath: string): BigIntStats | null {
    try {
      return this.clock.around(() => lstatSync(absolute, { bigint: true }));
    } catch (cause) {
      const code = codeOf(cause);
      if (code !== 'ENOENT') this.sink.problem(relPath, code);
      return null;
    }
  }

  private fileEntry(folder: Folder, name: string, relPath: string, stats: BigIntStats): WalkEntry {
    return {
      ...this.identityOf(folder, name, relPath, stats),
      kind: 'file',
      nlink: Number(stats.nlink),
    };
  }

  private otherEntry(
    folder: Folder,
    name: string,
    relPath: string,
    stats: BigIntStats,
  ): WalkEntry | null {
    const identity = this.identityOf(folder, name, relPath, stats);
    if (stats.isSymbolicLink()) {
      const target = this.target(join(folder.absolute, name), relPath);
      return target === null ? null : { ...identity, kind: 'link', target };
    }
    const special = specialOf(stats);
    return special === null
      ? null
      : { ...identity, kind: 'special', special, rdev: Number(stats.rdev) };
  }

  private target(absolute: string, relPath: string): string | null {
    try {
      const target = this.clock.around(() => readlinkSync(absolute, { encoding: 'utf8' }));
      return target === '' ? null : target;
    } catch (cause) {
      const code = codeOf(cause);
      if (code !== 'ENOENT') this.sink.problem(relPath, code);
      return null;
    }
  }

  private identityOf(
    folder: Folder,
    name: string,
    relPath: string,
    stats: BigIntStats,
  ): EntryIdentity {
    return {
      relPath,
      name,
      parentRelPath: folder.relPath === '' ? null : folder.relPath,
      bytes: Number(stats.size),
      modifiedMs: Number(stats.mtimeMs),
      mtimeNs: stats.mtimeNs.toString(),
      mode: modeOf(stats),
      dev: stats.dev.toString(),
      ino: stats.ino.toString(),
    };
  }
}

export function walkRoot(data: WalkData, sink: WalkSink): WalkResult {
  return new Walker(data, sink, new Int32Array(data.control)).run();
}
