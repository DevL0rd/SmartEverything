import type { DriveItem } from '@smarteverything/domain';
import type { DriveInode } from '../store/repositories/drive-inodes';
import type { DriveInodePatch } from '../store/repositories/drive-item-inodes';
import type { DriveItemEntry } from '../store/repositories/drive-items';
import { isFileItem } from './file-item';
import { diskModeOf } from './intents';
import type { WalkEntry } from './scanner-walk';

export type IndexedKind = WalkEntry['kind'];

export interface Indexed {
  readonly id: string;
  readonly relPath: string;
  readonly kind: IndexedKind;
  readonly bytes: number;
  readonly modifiedAt: string;
  readonly childCount: number | null;
  readonly target: string | null;
  readonly dev: string | null;
  readonly ino: string | null;
  readonly inodeId: number;
  readonly mode: number;
  readonly sha256: string | null;
}

export interface ScanTotals {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
}

export function totalsOf(live: Iterable<Indexed>): ScanTotals {
  let items = 0;
  let folders = 0;
  let bytes = 0;
  for (const indexed of live) {
    if (indexed.kind === 'folder') {
      folders += 1;
    } else {
      items += 1;
      if (indexed.kind === 'file') bytes += indexed.bytes;
    }
  }
  return { items, folders, bytes };
}

export function identityKey(dev: string | null, ino: string | null): string {
  return `${dev ?? ''}:${ino ?? ''}`;
}

export function kindOf(item: DriveItem): IndexedKind {
  switch (item.kind) {
    case 'folder':
    case 'link':
    case 'special':
      return item.kind;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'other':
      return 'file';
  }
}

export function indexedOf(entry: DriveItemEntry, inode: DriveInode | undefined): Indexed {
  const item = entry.item;
  return {
    id: item.id,
    relPath: item.relPath,
    kind: kindOf(item),
    bytes: item.bytes,
    modifiedAt: item.modifiedAt,
    childCount: item.kind === 'folder' ? item.childCount : null,
    target: item.kind === 'link' ? item.linkTarget : null,
    dev: entry.identity?.dev ?? null,
    ino: entry.identity?.ino ?? null,
    inodeId: entry.inodeId,
    mode: inode?.mode ?? 0,
    sha256: isFileItem(item) ? item.sha256 : null,
  };
}

export function isoOf(entry: WalkEntry): string {
  return new Date(entry.modifiedMs).toISOString();
}

export function sameIdentity(indexed: Indexed, entry: WalkEntry): boolean {
  return indexed.kind === entry.kind && indexed.dev === entry.dev && indexed.ino === entry.ino;
}

export function sameContent(indexed: Indexed, entry: WalkEntry): boolean {
  if (indexed.modifiedAt !== isoOf(entry) || indexed.bytes !== entry.bytes) return false;
  if (entry.kind === 'link') return indexed.target === entry.target;
  return entry.kind !== 'folder' || indexed.childCount === entry.childCount;
}

function forcedBits(entry: WalkEntry): number {
  return diskModeOf(0, entry.kind === 'folder');
}

const DISK_PERMISSION_BITS = 0o777;

export function modeDrifts(stored: number, entry: WalkEntry): boolean {
  if (entry.kind === 'link') return false;
  const forced = forcedBits(entry);
  return (
    ((entry.mode & DISK_PERMISSION_BITS) | forced) !== ((stored & DISK_PERMISSION_BITS) | forced)
  );
}

export function specialPatch(
  entry: Extract<WalkEntry, { readonly kind: 'special' }>,
): DriveInodePatch {
  const device = entry.special === 'char' || entry.special === 'block';
  return { specialType: entry.special, ...(device ? { rdev: entry.rdev } : {}) };
}

export function linked(entry: WalkEntry): boolean {
  return entry.kind === 'file' && entry.nlink > 1;
}

export function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function carriesLink(base: DriveItem, entry: WalkEntry): boolean {
  return (
    base.kind === 'link' &&
    entry.kind === 'link' &&
    base.linkTarget === entry.target &&
    base.bytes === entry.bytes &&
    base.modifiedAt === isoOf(entry)
  );
}

export function carriesFile(base: DriveItem, entry: WalkEntry, mime: string): boolean {
  return (
    isFileItem(base) &&
    base.mime === mime &&
    base.bytes === entry.bytes &&
    base.modifiedAt === isoOf(entry)
  );
}
