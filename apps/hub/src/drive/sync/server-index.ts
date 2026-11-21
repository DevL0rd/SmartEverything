import { createHash } from 'node:crypto';
import type { DriveFeedRow, DriveItem, DriveTrashEntry } from '@smarteverything/domain';
import { blockCount, blockSizeFor, type SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import { FILE_MODE, FOLDER_MODE, nsOfMoment } from '../../store/repositories/drive-inodes';
import type { HostStore } from '../../store/host/host-store';
import { DRIVE_PAGE_SIZE } from '../page-size';
import type { SyncScope } from './placement-scope';
import { inScope, toWirePath } from './sync-paths';
import { metaOf } from './item-meta';

export type SyncIndexStore = Pick<
  HostStore,
  | 'driveRoots'
  | 'driveItems'
  | 'driveBlocks'
  | 'driveFeed'
  | 'driveTrash'
  | 'driveInodes'
  | 'driveXattrs'
>;

const HASH_BYTES = 32;

export const NO_BLOCKS_HASH = createHash('sha256').update(new Uint8Array(0)).digest('hex');

export interface SyncCatchUp {
  readonly entries: readonly SyncIndexEntry[];
  readonly seq: number;
  readonly more: boolean;
}

export function blocksHashOf(hashes: Uint8Array): string {
  return createHash('sha256').update(hashes).digest('hex');
}

function blocksMatch(
  item: Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>,
  blocks: DriveBlocks,
): boolean {
  return blocks.hashes.length === blockCount(item.bytes, blocks.blockSize) * HASH_BYTES;
}

export function entryOf(
  store: SyncIndexStore,
  scope: SyncScope,
  item: DriveItem,
): SyncIndexEntry | null {
  const relPath = toWirePath(scope, item.relPath);
  if (relPath === null) return null;
  if (item.kind === 'special') return null;
  const meta = metaOf(store, item);
  const base = {
    itemId: item.id,
    relPath,
    mtime: item.modifiedAt,
    mtimeNs: meta.mtimeNs,
    rev: item.rev,
    deleted: false,
    mode: meta.mode,
    xattrs: meta.xattrs,
  };
  if (item.kind === 'folder') return { ...base, kind: 'folder' };
  if (item.kind === 'link') {
    return { ...base, kind: 'link', inode: meta.inode, target: item.linkTarget };
  }
  const blocks = store.driveBlocks.find(item.id, item.rev);
  if (blocks === undefined || !blocksMatch(item, blocks)) return null;
  return {
    ...base,
    kind: 'file',
    inode: meta.inode,
    bytes: item.bytes,
    blockSize: blocks.blockSize,
    blocksHash: blocksHashOf(blocks.hashes),
  };
}

function tombstoneOf(
  entry: Pick<DriveTrashEntry, 'itemId' | 'isFolder' | 'bytes'>,
  relPath: string,
  row: DriveFeedRow,
): SyncIndexEntry {
  const base = {
    itemId: entry.itemId,
    relPath,
    mtime: row.at,
    mtimeNs: nsOfMoment(row.at).toString(),
    rev: row.rev,
    deleted: true,
    xattrs: [],
  };
  if (entry.isFolder) return { ...base, kind: 'folder', mode: FOLDER_MODE };
  return {
    ...base,
    kind: 'file',
    mode: FILE_MODE,
    inode: null,
    bytes: entry.bytes,
    blockSize: blockSizeFor(entry.bytes),
    blocksHash: NO_BLOCKS_HASH,
  };
}

function removed(row: DriveFeedRow): boolean {
  return row.op === 'trash' || row.op === 'delete';
}

function departed(row: DriveFeedRow): boolean {
  return row.op === 'move' || row.op === 'rename';
}

function entryForRow(
  store: SyncIndexStore,
  scope: SyncScope,
  row: DriveFeedRow,
): SyncIndexEntry | null {
  if (removed(row)) {
    const trashed = store.driveTrash.find(row.itemId);
    if (trashed === undefined) return null;
    const relPath = toWirePath(scope, trashed.originalRelPath);
    return relPath === null ? null : tombstoneOf(trashed, relPath, row);
  }
  const item = store.driveItems.find(row.itemId, null);
  if (item === undefined) return null;
  if (inScope(scope, item.relPath)) return entryOf(store, scope, item);
  if (!departed(row)) return null;
  return tombstoneOf(
    { itemId: item.id, isFolder: item.kind === 'folder', bytes: item.bytes },
    item.name,
    row,
  );
}

export function entriesForRows(
  store: SyncIndexStore,
  scope: SyncScope,
  rows: readonly DriveFeedRow[],
): readonly SyncIndexEntry[] {
  const latest = new Map<string, DriveFeedRow>();
  for (const row of rows) {
    latest.delete(row.itemId);
    latest.set(row.itemId, row);
  }
  const entries: SyncIndexEntry[] = [];
  for (const row of latest.values()) {
    const entry = entryForRow(store, scope, row);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

export function changesAfter(store: SyncIndexStore, scope: SyncScope, after: number): SyncCatchUp {
  const window = store.driveFeed.sinceInRoot(scope.drive.id, after, DRIVE_PAGE_SIZE);
  return {
    entries: entriesForRows(store, scope, window.rows),
    seq: window.rows.at(-1)?.seq ?? after,
    more: window.next !== null,
  };
}

export interface IndexCursor {
  readonly parents: readonly (string | null)[];
  readonly at: number;
  readonly after: string | null;
}

export interface IndexPage {
  readonly entries: readonly SyncIndexEntry[];
  readonly cursor: IndexCursor | null;
}

export function firstIndexCursor(scope: SyncScope): IndexCursor {
  return { parents: [scope.base?.id ?? null], at: 0, after: null };
}

export function indexPage(store: SyncIndexStore, scope: SyncScope, cursor: IndexCursor): IndexPage {
  const parents = [...cursor.parents];
  let { at, after } = cursor;
  const entries: SyncIndexEntry[] = [];
  while (at < parents.length && entries.length < DRIVE_PAGE_SIZE) {
    const window = store.driveItems.children({
      rootId: scope.drive.id,
      parentId: parents[at] ?? null,
      after,
      limit: DRIVE_PAGE_SIZE - entries.length,
      viewer: null,
    });
    for (const { item } of window.entries) {
      if (!inScope(scope, item.relPath)) continue;
      if (item.kind === 'folder') parents.push(item.id);
      const entry = entryOf(store, scope, item);
      if (entry !== null) entries.push(entry);
    }
    after = window.next;
    if (after === null) at += 1;
  }
  return { entries, cursor: at < parents.length ? { parents, at, after } : null };
}
