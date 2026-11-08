import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import mime from 'mime-types';
import type {
  DriveItemDraft,
  DriveItemEntry,
  DriveItemsRepository,
} from '../store/repositories/drive-items';
import { WALK_BATCH_ROWS, type WalkEntry } from './scanner-walk';

export interface CommitDependencies {
  readonly items: Pick<DriveItemsRepository, 'byPath' | 'children' | 'find' | 'remove' | 'write'>;
  readonly write: <T>(work: () => T) => T;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface ScanTotals {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
}

interface Indexed {
  readonly id: string;
  readonly relPath: string;
  readonly folder: boolean;
  readonly bytes: number;
  readonly modifiedAt: string;
  readonly childCount: number | null;
  readonly dev: string | null;
  readonly ino: string | null;
}

type FileKind = 'image' | 'video' | 'audio' | 'document' | 'other';

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

export function classify(name: string): { readonly mime: string; readonly kind: FileKind } {
  const found = mime.lookup(name);
  const type = found === false ? OCTET_STREAM : found;
  if (type.startsWith('image/')) return { mime: type, kind: 'image' };
  if (type.startsWith('video/')) return { mime: type, kind: 'video' };
  if (type.startsWith('audio/')) return { mime: type, kind: 'audio' };
  const document = DOCUMENT_MIMES.some((prefix) => type.startsWith(prefix));
  return { mime: type, kind: document ? 'document' : 'other' };
}

function identityKey(dev: string | null, ino: string | null): string {
  return `${dev ?? ''}:${ino ?? ''}`;
}

function indexedOf(entry: DriveItemEntry): Indexed {
  const item = entry.item;
  return {
    id: item.id,
    relPath: item.relPath,
    folder: item.kind === 'folder',
    bytes: item.bytes,
    modifiedAt: item.modifiedAt,
    childCount: item.kind === 'folder' ? item.childCount : null,
    dev: entry.identity?.dev ?? null,
    ino: entry.identity?.ino ?? null,
  };
}

function isoOf(entry: WalkEntry): string {
  return new Date(entry.modifiedMs).toISOString();
}

function sameIdentity(indexed: Indexed, entry: WalkEntry): boolean {
  return (
    indexed.folder === (entry.kind === 'folder') &&
    indexed.dev === entry.dev &&
    indexed.ino === entry.ino
  );
}

function sameContent(indexed: Indexed, entry: WalkEntry): boolean {
  if (indexed.modifiedAt !== isoOf(entry) || indexed.bytes !== entry.bytes) return false;
  return entry.kind !== 'folder' || indexed.childCount === entry.childCount;
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

interface Common {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly starred: boolean;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly remoteId: string | null;
  readonly remoteRev: string | null;
}

const NO_MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
} as const;

function fileDraft(common: Common, entry: WalkEntry): DriveItemDraft {
  const { mime: type, kind } = classify(entry.name);
  const file = {
    ...common,
    mime: type,
    bytes: entry.bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  } as const;
  switch (kind) {
    case 'image':
      return { ...file, ...NO_MEDIA, kind };
    case 'video':
      return { ...file, ...NO_MEDIA, kind, durationMs: null };
    case 'audio':
      return { ...file, kind, takenAt: null, durationMs: null };
    case 'document':
    case 'other':
      return { ...file, kind };
  }
}

function freshDraft(common: Common, entry: WalkEntry): DriveItemDraft {
  if (entry.kind === 'folder') {
    return {
      ...common,
      kind: 'folder',
      childCount: entry.childCount ?? 0,
      bytes: entry.bytes,
    };
  }
  return fileDraft(common, entry);
}

function resolveUnreadable(entry: WalkEntry, base: DriveItem | null): WalkEntry {
  if (entry.kind !== 'folder' || entry.childCount !== null || base?.kind !== 'folder') {
    return entry;
  }
  return { ...entry, childCount: base.childCount, bytes: base.bytes };
}

function ownersOf(
  base: DriveItem | null,
): Pick<Common, 'addedByProfileId' | 'remoteId' | 'remoteRev'> {
  return {
    addedByProfileId: base?.addedByProfileId ?? null,
    remoteId: base?.remoteId ?? null,
    remoteRev: base?.remoteRev ?? null,
  };
}

export class ScanCommitter {
  private readonly live = new Map<string, Indexed>();
  private readonly byIdentity = new Map<string, Indexed>();
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
          !this.seen.has(indexed.id) && !unreadable.some((path) => under(indexed.relPath, path)),
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
      const window = this.deps.items.children(this.root.id, parent, after, WALK_BATCH_ROWS);
      for (const entry of window.entries) {
        const indexed = indexedOf(entry);
        this.live.set(indexed.relPath, indexed);
        this.byIdentity.set(identityKey(indexed.dev, indexed.ino), indexed);
        if (indexed.folder) folders.push(indexed.id);
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
    const mover = this.mover(entry);
    if (mover !== undefined) {
      this.move(mover, entry, hit);
    } else if (hit !== undefined && !hit.folder && entry.kind === 'file') {
      this.deferred.push(entry);
    } else if (hit !== undefined) {
      this.save(hit, entry);
    } else {
      this.save(null, entry);
    }
  }

  private settle(entry: WalkEntry): void {
    const hit = this.live.get(entry.relPath);
    this.save(hit !== undefined && !this.seen.has(hit.id) ? hit : null, entry);
  }

  private mover(entry: WalkEntry): Indexed | undefined {
    const candidate = this.byIdentity.get(identityKey(entry.dev, entry.ino));
    const matches =
      candidate !== undefined &&
      !this.seen.has(candidate.id) &&
      candidate.relPath !== entry.relPath &&
      sameIdentity(candidate, entry) &&
      (entry.kind === 'folder' || sameContent(candidate, entry));
    return matches ? candidate : undefined;
  }

  private keep(hit: Indexed, entry: WalkEntry): void {
    if ((entry.kind === 'folder' && entry.childCount === null) || sameContent(hit, entry)) {
      this.seen.add(hit.id);
      return;
    }
    this.save(hit, entry);
  }

  private move(mover: Indexed, entry: WalkEntry, occupant: Indexed | undefined): void {
    if (occupant !== undefined) this.sweep(occupant);
    const occupied = this.deps.items.byPath(this.root.id, entry.relPath);
    if (occupied !== undefined && occupied.id !== mover.id) this.evict(occupied.id, entry.relPath);
    this.live.delete(mover.relPath);
    this.save(mover, entry);
  }

  private save(previous: Indexed | null, entry: WalkEntry): void {
    const base = this.base(previous, entry);
    const id = base?.id ?? this.deps.newId();
    const resolved = resolveUnreadable(entry, base);
    const common = this.common(id, resolved, base);
    const draft =
      base !== null && this.carries(base, resolved)
        ? { ...base, ...common }
        : freshDraft(common, resolved);
    const written = this.deps.items.write({
      item: draft,
      identity: { dev: entry.dev, ino: entry.ino },
    }).item;
    this.seen.add(id);
    this.live.set(entry.relPath, this.indexed(written, entry));
  }

  private base(previous: Indexed | null, entry: WalkEntry): DriveItem | null {
    return (
      this.deps.items.byPath(this.root.id, entry.relPath) ??
      (previous === null ? null : (this.deps.items.find(previous.id) ?? null))
    );
  }

  private carries(base: DriveItem, entry: WalkEntry): boolean {
    if (entry.kind === 'folder') return false;
    return (
      base.kind !== 'folder' &&
      base.mime === classify(entry.name).mime &&
      base.bytes === entry.bytes &&
      base.modifiedAt === isoOf(entry)
    );
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
      starred: base?.starred ?? false,
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

  private indexed(item: DriveItem, entry: WalkEntry): Indexed {
    return {
      id: item.id,
      relPath: item.relPath,
      folder: item.kind === 'folder',
      bytes: item.bytes,
      modifiedAt: item.modifiedAt,
      childCount: item.kind === 'folder' ? item.childCount : null,
      dev: entry.dev,
      ino: entry.ino,
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
      if (indexed.folder) {
        folders += 1;
      } else {
        items += 1;
        bytes += indexed.bytes;
      }
    }
    return { items, folders, bytes };
  }
}
