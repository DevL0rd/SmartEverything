import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import type { DriveInodesRepository } from '../store/repositories/drive-inodes';
import type { DriveInodePatch } from '../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemsRepository } from '../store/repositories/drive-items';
import type { DriveMissingRepository } from '../store/repositories/drive-missing';
import {
  freshDraft,
  ownersOf,
  resolveUnreadable,
  ScanStepError,
  type Common,
  type FileType,
  type ScanEntry,
} from './scanner-drafts';
import {
  carriesFile,
  carriesLink,
  identityKey,
  indexedFrom,
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
import {
  filesBySize,
  missingRecords,
  reclaimPlace,
  ReuseIndex,
  withHash,
  type Unknown,
} from './scanner-reuse';
import { indexedAt, indexedChildren, parentPathOf, ScanOrderError } from './scanner-scope';
import { WALK_BATCH_ROWS, type WalkEntry } from './scanner-walk';

export interface CommitDependencies {
  readonly items: Pick<
    DriveItemsRepository,
    'byPath' | 'children' | 'find' | 'identityOf' | 'remove' | 'write'
  >;
  readonly inodes: Pick<DriveInodesRepository, 'findMany' | 'names' | 'ofItem'>;
  readonly missing: Pick<DriveMissingRepository, 'expire' | 'ofRoot' | 'reclaim' | 'record'>;
  readonly now: () => Date;
  readonly newId: () => string;
}

interface Waiting {
  readonly entry: ScanEntry;
  readonly hashed: boolean;
}

export class ScanCommitter {
  private readonly live = new Map<string, Indexed>();
  private readonly byIdentity = new Map<string, Indexed[]>();
  private readonly inodeOfIdentity = new Map<string, number>();
  private readonly seen = new Set<string>();
  private readonly deferred: ScanEntry[] = [];
  private readonly unknown: ScanEntry[] = [];
  private waiting: readonly Waiting[] | null = null;
  private sized: ReadonlyMap<number, readonly Indexed[]> | null = null;
  private unreadable: readonly string[] = [];
  private gone: readonly Indexed[] | null = null;
  private swept = 0;
  private readonly reuse: ReuseIndex;
  private readonly known: boolean;
  private readonly count: number;

  constructor(
    private readonly deps: CommitDependencies,
    private readonly root: DriveRoot,
    private readonly scopes: readonly string[] | null,
  ) {
    deps.missing.expire(root.id, deps.now().toISOString());
    this.reuse = new ReuseIndex(deps.missing.ofRoot(root.id));
    this.load();
    this.count = this.live.size;
    this.known = scopes !== null || this.count > 0;
  }

  get previous(): number {
    return this.count;
  }

  apply(entries: readonly ScanEntry[]): void {
    for (const entry of entries) this.entry(entry);
  }

  settle(unreadable: readonly string[]): readonly WalkEntry[] {
    for (const entry of this.deferred.splice(0)) this.settleEntry(entry);
    this.unreadable = unreadable;
    const sized = filesBySize(this.unseen(unreadable));
    this.sized = sized;
    this.waiting = this.unknown
      .splice(0)
      .map((entry) => ({ entry, hashed: this.reuse.wantsHash(entry, this.open(sized, entry)) }));
    return this.waiting.filter((waiting) => waiting.hashed).map((waiting) => waiting.entry);
  }

  place(hashes: readonly (string | null)[]): void {
    const { waiting, sized } = this;
    if (waiting === null || sized === null) {
      throw new ScanStepError('The scan placed its new entries before it settled.');
    }
    const wanted = waiting.filter((entry) => entry.hashed).length;
    if (hashes.length !== wanted) {
      throw new ScanStepError(
        `The scan asked for ${String(wanted)} hashes and got ${String(hashes.length)}.`,
      );
    }
    let next = 0;
    for (const { entry, hashed } of waiting) {
      const sha256 = hashed ? hashes[next] : null;
      if (sha256 === undefined)
        throw new ScanStepError(`The scan has no hash for ${entry.relPath}.`);
      if (hashed) next += 1;
      this.placeEntry(entry, sha256, this.open(sized, entry));
    }
    this.waiting = null;
    this.gone = this.unseen(this.unreadable).sort(
      (left, right) => left.relPath.length - right.relPath.length,
    );
  }

  sweep(): boolean {
    const { gone } = this;
    if (gone === null) throw new ScanStepError('The scan swept before it placed its new entries.');
    const batch = gone.slice(this.swept, this.swept + WALK_BATCH_ROWS);
    for (const indexed of batch) this.sweepIndexed(indexed);
    this.swept += batch.length;
    return this.swept < gone.length;
  }

  private unseen(unreadable: readonly string[]): Indexed[] {
    return [...this.live.values()].filter(
      (indexed) =>
        indexed.kind !== 'special' &&
        !this.seen.has(indexed.id) &&
        !unreadable.some((path) => under(indexed.relPath, path)),
    );
  }

  private open(sized: ReadonlyMap<number, readonly Indexed[]>, entry: WalkEntry): Indexed[] {
    return (sized.get(entry.bytes) ?? []).filter(
      (indexed) => !this.seen.has(indexed.id) && this.live.get(indexed.relPath)?.id === indexed.id,
    );
  }

  private placeEntry(entry: ScanEntry, sha256: string | null, open: readonly Indexed[]): void {
    const found: Unknown = { entry, sha256 };
    const reuse = this.reuse.chosen(found, open);
    if (reuse?.kind === 'live') {
      this.live.delete(reuse.indexed.relPath);
      this.save(reuse.indexed, entry, sha256);
      return;
    }
    if (reuse?.kind === 'missing') {
      this.reuse.take(reuse.item);
      this.deps.missing.reclaim(
        reuse.item.itemId,
        reclaimPlace(found, reuse.item, this.parentOf(entry)),
      );
    }
    this.save(null, entry, sha256);
  }

  private load(): void {
    if (this.scopes === null) {
      this.loadBelow(null);
      return;
    }
    for (const scope of this.scopes) this.loadScope(scope);
  }

  private loadBelow(start: string | null): void {
    const pending: (string | null)[] = [start];
    for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
      pending.push(...this.loadChildren(parent));
    }
  }

  private loadScope(scope: string): void {
    const parent = parentPathOf(scope);
    if (parent !== null) {
      const anchor = indexedAt(this.deps, this.root.id, parent);
      if (anchor?.kind !== 'folder') throw new ScanOrderError(scope);
      this.live.set(anchor.relPath, anchor);
      this.seen.add(anchor.id);
    }
    const indexed = indexedAt(this.deps, this.root.id, scope);
    if (indexed === undefined) return;
    this.note(indexed);
    if (indexed.kind === 'folder') this.loadBelow(indexed.id);
  }

  private note(indexed: Indexed): void {
    this.live.set(indexed.relPath, indexed);
    const key = identityKey(indexed.dev, indexed.ino);
    const known = this.byIdentity.get(key);
    if (known === undefined) this.byIdentity.set(key, [indexed]);
    else known.push(indexed);
    if (indexed.kind === 'file' && !this.inodeOfIdentity.has(key)) {
      this.inodeOfIdentity.set(key, indexed.inodeId);
    }
    this.reuse.noteLive(indexed);
  }

  private loadChildren(parent: string | null): readonly string[] {
    const folders: string[] = [];
    for (const indexed of indexedChildren(this.deps, this.root.id, parent)) {
      this.note(indexed);
      if (indexed.kind === 'folder') folders.push(indexed.id);
    }
    return folders;
  }

  private entry(entry: ScanEntry): void {
    const hit = this.live.get(entry.relPath);
    if (hit !== undefined && sameIdentity(hit, entry)) {
      this.keep(hit, entry);
      return;
    }
    const mover = linked(entry) ? undefined : this.mover(entry);
    if (mover !== undefined) {
      this.move(mover, entry, hit);
      return;
    }
    this.unmatched(hit, entry);
  }

  private unmatched(hit: Indexed | undefined, entry: ScanEntry): void {
    if (linked(entry) || (hit !== undefined && hit.kind !== 'folder' && entry.kind === 'file')) {
      this.deferred.push(entry);
    } else if (hit === undefined && this.reuse.mayReuse(entry)) {
      this.unknown.push(entry);
    } else {
      this.save(hit ?? null, entry, null);
    }
  }

  private settleEntry(entry: ScanEntry): void {
    const hit = this.live.get(entry.relPath);
    const mover = this.mover(entry);
    if (mover !== undefined) {
      this.move(mover, entry, hit);
      return;
    }
    this.save(hit !== undefined && !this.seen.has(hit.id) ? hit : null, entry, null);
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

  private keep(hit: Indexed, entry: ScanEntry): void {
    if (
      (entry.kind === 'folder' && entry.childCount === null) ||
      (sameContent(hit, entry) && !modeDrifts(hit.mode, entry))
    ) {
      this.seen.add(hit.id);
      return;
    }
    this.save(hit, entry, null);
  }

  private move(mover: Indexed, entry: ScanEntry, occupant: Indexed | undefined): void {
    if (occupant !== undefined) this.sweepIndexed(occupant);
    const occupied = this.deps.items.byPath(this.root.id, entry.relPath, null);
    if (occupied !== undefined && occupied.id !== mover.id) this.evict(occupied.id, entry.relPath);
    this.live.delete(mover.relPath);
    this.save(mover, entry, null);
  }

  private save(previous: Indexed | null, entry: ScanEntry, sha256: string | null): void {
    const base = this.reusable(this.base(previous, entry), previous, entry);
    const resolved = resolveUnreadable(entry, base);
    const common = this.common(base?.id ?? this.deps.newId(), resolved, base);
    const carried = base !== null && this.carries(base, resolved, entry.type);
    const draft = withHash(
      carried ? { ...base, ...common } : freshDraft(common, resolved, entry.type),
      sha256,
    );
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
    this.live.set(entry.relPath, indexedFrom(written, entry, inode));
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

  private carries(base: DriveItem, entry: WalkEntry, type: FileType): boolean {
    switch (entry.kind) {
      case 'folder':
        return false;
      case 'link':
        return carriesLink(base, entry);
      case 'special':
        return base.kind === 'special';
      case 'file':
        return carriesFile(base, entry, type.mime);
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

  private sweepIndexed(indexed: Indexed): void {
    if (this.live.get(indexed.relPath)?.id !== indexed.id) return;
    const at = this.deps.now().toISOString();
    for (const record of missingRecords(this.root.id, indexed, this.live.values(), at)) {
      if (!this.seen.has(record.itemId)) this.deps.missing.record(record);
    }
    this.evict(indexed.id, indexed.relPath);
  }

  private evict(id: string, relPath: string): void {
    this.deps.items.remove(id);
    for (const path of [...this.live.keys()]) {
      if (under(path, relPath)) this.live.delete(path);
    }
  }
}
