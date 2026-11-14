import { createHash } from 'node:crypto';
import type { DriveFeedRow, DriveItem, DriveTrashEntry } from '@smarteverything/domain';
import { blockCount, blockSizeFor, type SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import type { Store } from '../../store/store';
import { DRIVE_PAGE_SIZE } from '../service-read';
import { inScope, toWirePath, type SyncScope } from './placement-scope';

export type SyncIndexStore = Pick<
  Store,
  'driveRoots' | 'driveItems' | 'driveBlocks' | 'driveFeed' | 'driveTrash'
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

export function indexIsStale(
  store: SyncIndexStore,
  scope: SyncScope,
  indexId: string | null,
  afterSeq: number,
): boolean {
  return indexId !== scope.indexId || afterSeq > store.driveFeed.latestSeqInRoot(scope.drive.id);
}

function blocksMatch(
  item: Exclude<DriveItem, { readonly kind: 'folder' }>,
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
  const base = {
    itemId: item.id,
    relPath,
    mtime: item.modifiedAt,
    rev: item.rev,
    deleted: false,
  };
  if (item.kind === 'folder') return { ...base, kind: 'folder' };
  const blocks = store.driveBlocks.find(item.id, item.rev);
  if (blocks === undefined || !blocksMatch(item, blocks)) return null;
  return {
    ...base,
    kind: 'file',
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
    rev: row.rev,
    deleted: true,
  };
  if (entry.isFolder) return { ...base, kind: 'folder' };
  return {
    ...base,
    kind: 'file',
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

function* liveItems(store: SyncIndexStore, scope: SyncScope): Generator<DriveItem> {
  const parents: (string | null)[] = [scope.base?.id ?? null];
  for (const parent of parents) {
    let after: string | null = null;
    do {
      const window = store.driveItems.children({
        rootId: scope.drive.id,
        parentId: parent,
        after,
        limit: DRIVE_PAGE_SIZE,
        viewer: null,
      });
      for (const { item } of window.entries) {
        if (!inScope(scope, item.relPath)) continue;
        yield item;
        if (item.kind === 'folder') parents.push(item.id);
      }
      after = window.next;
    } while (after !== null);
  }
}

export function* indexPages(
  store: SyncIndexStore,
  scope: SyncScope,
): Generator<readonly SyncIndexEntry[]> {
  let page: SyncIndexEntry[] = [];
  for (const item of liveItems(store, scope)) {
    const entry = entryOf(store, scope, item);
    if (entry === null) continue;
    page.push(entry);
    if (page.length === DRIVE_PAGE_SIZE) {
      yield page;
      page = [];
    }
  }
  yield page;
}
