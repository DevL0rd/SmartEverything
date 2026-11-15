import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import mime from 'mime-types';
import type { DriveInode, DriveInodesRepository } from '../store/repositories/drive-inodes';
import type { DriveInodePatch } from '../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemsRepository } from '../store/repositories/drive-items';
import {
  freshDraft,
  ownersOf,
  resolveUnreadable,
  type Common,
  type FileType,
} from './scanner-drafts';
import {
  carriesFile,
  carriesLink,
  identityKey,
  indexedOf,
  isoOf,
  kindOf,
  linked,
  modeDrifts,
  sameContent,
  sameIdentity,
  specialPatch,
  under,
  type Indexed,
} from './scanner-index';
import { WALK_BATCH_ROWS, type WalkEntry } from './scanner-walk';

export interface CommitDependencies {
  readonly items: Pick<
    DriveItemsRepository,
    'byPath' | 'children' | 'find' | 'identityOf' | 'remove' | 'write'
  >;
  readonly inodes: Pick<DriveInodesRepository, 'findMany' | 'names' | 'ofItem'>;
  readonly write: <T>(work: () => T) => T;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface ScanTotals {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
}

const OCTET_STREAM = 'application/octet-stream';

const DOCUMENT_MIMES: readonly string[] = [
  'text/',
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.oasis.opendocument',
];

export class ScanOrderError extends Error {
  override readonly name = 'ScanOrderError';

  constructor(readonly relPath: string) {
    super(`The scan reached ${relPath} before its folder.`);
  }
}

export function classify(name: string): FileType {
  const found = mime.lookup(name);
  const type = found === false ? OCTET_STREAM : found;
  if (type.startsWith('image/')) return { mime: type, kind: 'image' };
  if (type.startsWith('video/')) return { mime: type, kind: 'video' };
  if (type.startsWith('audio/')) return { mime: type, kind: 'audio' };
  const document = DOCUMENT_MIMES.some((prefix) => type.startsWith(prefix));
  return { mime: type, kind: document ? 'document' : 'other' };
}

export class ScanCommitter {
  private readonly live = new Map<string, Indexed>();
  private readonly byIdentity = new Map<string, Indexed[]>();
  private readonly inodeOfIdentity = new Map<string, number>();
  private readonly seen = new Set<string>();
  private readonly deferred: WalkEntry[] = [];
  private readonly known: boolean;
  private readonly count: number;

  constructor(
    private readonly deps: CommitDependencies,
    private readonly root: DriveRoot,
  ) {
    this.load();
    this.count = this.live.size;
    this.known = this.count > 0;
  }

  get previous(): number {
    return this.count;
  }

  apply(entries: readonly WalkEntry[]): void {
    this.deps.write(() => {
      for (const entry of entries) this.entry(entry);
    });
  }

  finish(unreadable: readonly string[]): ScanTotals {
    this.deps.write(() => {
      for (const entry of this.deferred.splice(0)) this.settle(entry);
    });
    const gone = [...this.live.values()]
      .filter(
        (indexed) =>
          indexed.kind !== 'special' &&
          !this.seen.has(indexed.id) &&
          !unreadable.some((path) => under(indexed.relPath, path)),
      )
      .sort((left, right) => left.relPath.length - right.relPath.length);
    for (let from = 0; from < gone.length; from += WALK_BATCH_ROWS) {
      this.deps.write(() => {
        for (const indexed of gone.slice(from, from + WALK_BATCH_ROWS)) this.sweep(indexed);
      });
    }
    return this.totals();
  }

  private load(): void {
    const pending: (string | null)[] = [null];
    for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
      pending.push(...this.loadChildren(parent));
    }
  }

  private loadChildren(parent: string | null): readonly string[] {
    const folders: string[] = [];
    let after: string | null = null;
    do {
      const window = this.deps.items.children({
        rootId: this.root.id,
        parentId: parent,
        after,
        limit: WALK_BATCH_ROWS,
        viewer: null,
      });
      const inodes = new Map(
        this.deps.inodes
          .findMany(window.entries.map((entry) => entry.inodeId))
          .map((inode) => [inode.id, inode]),
      );
      for (const entry of window.entries) {
        const indexed = indexedOf(entry, inodes.get(entry.inodeId));
        this.live.set(indexed.relPath, indexed);
        const key = identityKey(indexed.dev, indexed.ino);
        const known = this.byIdentity.get(key);
        if (known === undefined) this.byIdentity.set(key, [indexed]);
        else known.push(indexed);
        if (indexed.kind === 'file' && !this.inodeOfIdentity.has(key)) {
          this.inodeOfIdentity.set(key, indexed.inodeId);
        }
        if (indexed.kind === 'folder') folders.push(indexed.id);
      }
      after = window.next;
    } while (after !== null);
    return folders;
  }

  private entry(entry: WalkEntry): void {
    const hit = this.live.get(entry.relPath);
    if (hit !== undefined && sameIdentity(hit, entry)) {
      this.keep(hit, entry);
      return;
    }
    const mover = linked(entry) ? undefined : this.mover(entry);
    if (mover !== undefined) {
      this.move(mover, entry, hit);
    } else if (
      linked(entry) ||
      (hit !== undefined && hit.kind !== 'folder' && entry.kind === 'file')
    ) {
      this.deferred.push(entry);
    } else {
      this.save(hit ?? null, entry);
    }
  }

  private settle(entry: WalkEntry): void {
    const hit = this.live.get(entry.relPath);
    const mover = this.mover(entry);
    if (mover !== undefined) {
      this.move(mover, entry, hit);
      return;
    }
    this.save(hit !== undefined && !this.seen.has(hit.id) ? hit : null, entry);
  }

  private mover(entry: WalkEntry): Indexed | undefined {
    return (this.byIdentity.get(identityKey(entry.dev, entry.ino)) ?? []).find(
      (candidate) =>
        !this.seen.has(candidate.id) &&
        candidate.relPath !== entry.relPath &&
        sameIdentity(candidate, entry) &&
        (entry.kind === 'folder' || sameContent(candidate, entry)),
    );
  }

  private keep(hit: Indexed, entry: WalkEntry): void {
    if (
      (entry.kind === 'folder' && entry.childCount === null) ||
      (sameContent(hit, entry) && !modeDrifts(hit.mode, entry))
    ) {
      this.seen.add(hit.id);
      return;
    }
    this.save(hit, entry);
  }

  private move(mover: Indexed, entry: WalkEntry, occupant: Indexed | undefined): void {
    if (occupant !== undefined) this.sweep(occupant);
    const occupied = this.deps.items.byPath(this.root.id, entry.relPath, null);
    if (occupied !== undefined && occupied.id !== mover.id) this.evict(occupied.id, entry.relPath);
    this.live.delete(mover.relPath);
    this.save(mover, entry);
  }

  private save(previous: Indexed | null, entry: WalkEntry): void {
    const base = this.reusable(this.base(previous, entry), previous, entry);
    const resolved = resolveUnreadable(entry, base);
    const common = this.common(base?.id ?? this.deps.newId(), resolved, base);
    const carried = base !== null && this.carries(base, resolved);
    const draft = carried
      ? { ...base, ...common }
      : freshDraft(common, resolved, classify(resolved.name));
    const written = this.store(draft, resolved, base, carried);
    this.seen.add(written.id);
    this.remember(written, entry);
  }

  private store(
    draft: DriveItemDraft,
    entry: WalkEntry,
    base: DriveItem | null,
    carried: boolean,
  ): DriveItem {
    const share =
      base === null && linked(entry)
        ? this.inodeOfIdentity.get(identityKey(entry.dev, entry.ino))
        : undefined;
    return this.deps.items.write({
      item: draft,
      identity: { dev: entry.dev, ino: entry.ino },
      inode: this.inodePatch(base, entry, carried),
      ...(share === undefined ? {} : { shareInode: share }),
    }).item;
  }

  private remember(written: DriveItem, entry: WalkEntry): void {
    const key = identityKey(entry.dev, entry.ino);
    const inode = this.deps.inodes.ofItem(written.id);
    if (inode !== undefined && entry.kind === 'file' && !this.inodeOfIdentity.has(key)) {
      this.inodeOfIdentity.set(key, inode.id);
    }
    this.live.set(entry.relPath, this.indexed(written, entry, inode));
  }

  private reusable(
    base: DriveItem | null,
    previous: Indexed | null,
    entry: WalkEntry,
  ): DriveItem | null {
    if (base === null) return null;
    if (kindOf(base) !== entry.kind || this.diverged(base, previous, entry)) {
      this.evict(base.id, base.relPath);
      return null;
    }
    return base;
  }

  private diverged(base: DriveItem, previous: Indexed | null, entry: WalkEntry): boolean {
    if (entry.kind !== 'file' || this.onSameFile(base, previous, entry)) return false;
    const inode = this.deps.inodes.ofItem(base.id);
    return inode !== undefined && this.deps.inodes.names(inode.id).length > 1;
  }

  private onSameFile(base: DriveItem, previous: Indexed | null, entry: WalkEntry): boolean {
    const identity =
      previous?.id === base.id
        ? { dev: previous.dev, ino: previous.ino }
        : this.deps.items.identityOf(base.id);
    return identity?.dev === entry.dev && identity.ino === entry.ino;
  }

  private inodePatch(base: DriveItem | null, entry: WalkEntry, carried: boolean): DriveInodePatch {
    const stored = base === null ? undefined : this.deps.inodes.ofItem(base.id);
    const mode =
      entry.kind !== 'link' && (stored === undefined || modeDrifts(stored.mode, entry))
        ? entry.mode
        : undefined;
    return {
      ...(mode === undefined ? {} : { mode }),
      ...(carried ? {} : { mtimeNs: BigInt(entry.mtimeNs) }),
      ...(entry.kind === 'special' ? specialPatch(entry) : {}),
    };
  }

  private base(previous: Indexed | null, entry: WalkEntry): DriveItem | null {
    return (
      this.deps.items.byPath(this.root.id, entry.relPath, null) ??
      (previous === null ? null : (this.deps.items.find(previous.id, null) ?? null))
    );
  }

  private carries(base: DriveItem, entry: WalkEntry): boolean {
    switch (entry.kind) {
      case 'folder':
        return false;
      case 'link':
        return carriesLink(base, entry);
      case 'special':
        return base.kind === 'special';
      case 'file':
        return carriesFile(base, entry, classify(entry.name).mime);
    }
  }

  private common(id: string, entry: WalkEntry, base: DriveItem | null): Common {
    return {
      id,
      rootId: this.root.id,
      parentId: this.parentOf(entry),
      relPath: entry.relPath,
      name: entry.name,
      modifiedAt: isoOf(entry),
      addedAt: base?.addedAt ?? this.deps.now().toISOString(),
      starred: false,
      shared: false,
      outside: this.known,
      ...ownersOf(base),
    };
  }

  private parentOf(entry: WalkEntry): string | null {
    if (entry.parentRelPath === null) return null;
    const parent = this.live.get(entry.parentRelPath);
    if (parent === undefined) throw new ScanOrderError(entry.relPath);
    return parent.id;
  }

  private indexed(item: DriveItem, entry: WalkEntry, inode: DriveInode | undefined): Indexed {
    return {
      id: item.id,
      relPath: item.relPath,
      kind: kindOf(item),
      bytes: item.bytes,
      modifiedAt: item.modifiedAt,
      childCount: item.kind === 'folder' ? item.childCount : null,
      target: item.kind === 'link' ? item.linkTarget : null,
      dev: entry.dev,
      ino: entry.ino,
      inodeId: inode?.id ?? 0,
      mode: inode?.mode ?? entry.mode,
    };
  }

  private sweep(indexed: Indexed): void {
    if (this.live.get(indexed.relPath)?.id !== indexed.id) return;
    this.evict(indexed.id, indexed.relPath);
  }

  private evict(id: string, relPath: string): void {
    this.deps.items.remove(id);
    for (const path of [...this.live.keys()]) {
      if (under(path, relPath)) this.live.delete(path);
    }
  }

  private totals(): ScanTotals {
    let items = 0;
    let folders = 0;
    let bytes = 0;
    for (const indexed of this.live.values()) {
      if (indexed.kind === 'folder') {
        folders += 1;
      } else {
        items += 1;
        if (indexed.kind === 'file') bytes += indexed.bytes;
      }
    }
    return { items, folders, bytes };
  }
}
