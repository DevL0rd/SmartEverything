import { createHash } from 'node:crypto';
import type { DriveFeedRow, DriveItem, DriveRoot, DriveTrashEntry } from '@smarteverything/domain';
import { blockCount, blockSizeFor, type SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import type { Store } from '../../store/store';
import { DRIVE_PAGE_SIZE } from '../service-read';

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
  root: DriveRoot,
  indexId: string | null,
  afterSeq: number,
): boolean {
  return indexId !== root.indexId || afterSeq > store.driveFeed.latestSeqInRoot(root.id);
}

function blocksMatch(
  item: Exclude<DriveItem, { readonly kind: 'folder' }>,
  blocks: DriveBlocks,
): boolean {
  return blocks.hashes.length === blockCount(item.bytes, blocks.blockSize) * HASH_BYTES;
}

export function entryOf(store: SyncIndexStore, item: DriveItem): SyncIndexEntry | null {
  const base = {
    itemId: item.id,
    relPath: item.relPath,
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

function tombstoneOf(entry: DriveTrashEntry, row: DriveFeedRow): SyncIndexEntry {
  const base = {
    itemId: entry.itemId,
    relPath: entry.originalRelPath,
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

function entryForRow(store: SyncIndexStore, row: DriveFeedRow): SyncIndexEntry | null {
  if (removed(row)) {
    const trashed = store.driveTrash.find(row.itemId);
    return trashed === undefined ? null : tombstoneOf(trashed, row);
  }
  const item = store.driveItems.find(row.itemId);
  return item === undefined ? null : entryOf(store, item);
}

export function entriesForRows(
  store: SyncIndexStore,
  rows: readonly DriveFeedRow[],
): readonly SyncIndexEntry[] {
  const latest = new Map<string, DriveFeedRow>();
  for (const row of rows) {
    latest.delete(row.itemId);
    latest.set(row.itemId, row);
  }
  const entries: SyncIndexEntry[] = [];
  for (const row of latest.values()) {
    const entry = entryForRow(store, row);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

export function changesAfter(store: SyncIndexStore, rootId: string, after: number): SyncCatchUp {
  const window = store.driveFeed.sinceInRoot(rootId, after, DRIVE_PAGE_SIZE);
  return {
    entries: entriesForRows(store, window.rows),
    seq: window.rows.at(-1)?.seq ?? after,
    more: window.next !== null,
  };
}

function* liveItems(store: SyncIndexStore, rootId: string): Generator<DriveItem> {
  const parents: (string | null)[] = [null];
  for (const parent of parents) {
    let after: string | null = null;
    do {
      const window = store.driveItems.children(rootId, parent, after, DRIVE_PAGE_SIZE);
      for (const { item } of window.entries) {
        yield item;
        if (item.kind === 'folder') parents.push(item.id);
      }
      after = window.next;
    } while (after !== null);
  }
}

export function* indexPages(
  store: SyncIndexStore,
  rootId: string,
): Generator<readonly SyncIndexEntry[]> {
  let page: SyncIndexEntry[] = [];
  for (const item of liveItems(store, rootId)) {
    const entry = entryOf(store, item);
    if (entry === null) continue;
    page.push(entry);
    if (page.length === DRIVE_PAGE_SIZE) {
      yield page;
      page = [];
    }
  }
  yield page;
}
