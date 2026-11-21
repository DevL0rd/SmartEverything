import type { DriveItem } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import type { BlockHashes } from '../blocks';
import { isFileItem, type FileItem } from '../file-item';
import { readDriveSettings } from '../settings';

export type HashStore = Pick<
  Store,
  'driveRoots' | 'driveItems' | 'driveBlocks' | 'drivePlacements' | 'settingsKv'
>;

export interface HashCandidate {
  readonly id: string;
  readonly relPath: string;
  readonly bytes: number;
  readonly openedAt: string | null;
  readonly dev: string;
  readonly ino: string;
  readonly wantBlocks: boolean;
}

export interface HashBacklog {
  readonly candidates: readonly HashCandidate[];
  readonly files: number;
  readonly hashed: number;
}

export interface HashStart {
  readonly root: StoredDrive | null;
  readonly indexingPaused: boolean;
  readonly wanted: boolean;
}

export interface HashRecordInput {
  readonly rootId: string;
  readonly itemId: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly modifiedMs: number;
  readonly blocks: BlockHashes | null;
}

export type HashRecorded =
  | { readonly kind: 'recorded' }
  | { readonly kind: 'stale' }
  | { readonly kind: 'changed'; readonly relPath: string };

export interface HashHealthInput {
  readonly rootId: string;
  readonly share: number;
}

export function modifiedIso(modifiedMs: number): string {
  return new Date(modifiedMs).toISOString();
}

export function syncsBlocks(store: Pick<Store, 'drivePlacements'>, rootId: string): boolean {
  return store.drivePlacements.forRoot(rootId).some((placement) => placement.mode === 'synced');
}

export function collectBacklog(
  store: Pick<Store, 'driveItems' | 'drivePlacements'>,
  rootId: string,
): HashBacklog {
  const synced = syncsBlocks(store, rootId);
  const { files, rows } = store.driveItems.lookups.hashBacklog(rootId, synced);
  const candidates = rows.map((row): HashCandidate => ({ ...row, wantBlocks: synced }));
  return { candidates, files, hashed: files - candidates.length };
}

export function hashStart(store: HashStore, rootId: string): HashStart {
  const root = store.driveRoots.find(rootId) ?? null;
  const settings = readDriveSettings(store);
  const wanted = root !== null && (syncsBlocks(store, rootId) || settings.duplicatesHashing);
  return { root, indexingPaused: settings.indexingPaused, wanted };
}

function stillValid(current: DriveItem | undefined, input: HashRecordInput): current is FileItem {
  return (
    current !== undefined &&
    isFileItem(current) &&
    current.bytes === input.bytes &&
    current.modifiedAt === modifiedIso(input.modifiedMs)
  );
}

function hashedItem(store: HashStore, current: FileItem, sha256: string): DriveItem | null {
  if (current.sha256 === sha256) return current;
  const identity = store.driveItems.identityOf(current.id);
  if (identity === null) return null;
  return store.driveItems.write({ item: { ...current, sha256 }, identity }).item;
}

export function recordHash(store: HashStore, input: HashRecordInput): HashRecorded {
  const current = store.driveItems.find(input.itemId, null);
  if (!stillValid(current, input)) return { kind: 'stale' };
  if (current.sha256 !== null && current.sha256 !== input.sha256)
    return { kind: 'changed', relPath: current.relPath };
  const written = hashedItem(store, current, input.sha256);
  if (written === null) return { kind: 'stale' };
  if (input.blocks !== null && syncsBlocks(store, input.rootId)) {
    store.driveBlocks.put({
      itemId: written.id,
      rev: written.rev,
      blockSize: input.blocks.blockSize,
      hashes: input.blocks.hashes,
    });
    store.driveBlocks.removeBefore(written.id, written.rev);
  }
  return { kind: 'recorded' };
}

export function recordHashHealth(store: HashStore, input: HashHealthInput): void {
  const root = store.driveRoots.find(input.rootId);
  if (root === undefined) return;
  store.driveRoots.update(root.id, { health: { ...root.health, hashedShare: input.share } });
}

export const HASH_BACKLOG_UNIT = storeUnit((store, input: { readonly rootId: string }) =>
  collectBacklog(store, input.rootId),
);

export const DRIVE_HASH_START_UNIT = storeUnit((store, input: { readonly rootId: string }) =>
  hashStart(store, input.rootId),
);

export const DRIVE_HASH_RECORD_UNIT = storeUnit((store, input: HashRecordInput) =>
  recordHash(store, input),
);

export const DRIVE_HASH_HEALTH_UNIT = storeUnit((store, input: HashHealthInput) => {
  recordHashHealth(store, input);
});
