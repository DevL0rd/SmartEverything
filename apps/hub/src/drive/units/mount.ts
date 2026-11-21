import type { DriveFeedOp, DriveFeedRow } from '@smarteverything/domain';
import type { DriveItemSpot } from '../../store/repositories/drive-item-lookups';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { itemAccess, type DriveActor } from '../access';

const PAGE = 100;

const SAME_CONTENT: ReadonlySet<DriveFeedOp> = new Set(['rename', 'move', 'star', 'unstar']);

export interface ElsewhereInput {
  readonly itemId: string;
  readonly rev: number;
  readonly nodeId: string;
  readonly baseRev: number;
}

export function changedElsewhereIn(
  store: { readonly driveFeed: Pick<Store['driveFeed'], 'recentOfItem'> },
  input: ElsewhereInput,
): boolean {
  if (input.rev === input.baseRev) return false;
  let before: number | null = null;
  for (;;) {
    const window = store.driveFeed.recentOfItem(input.itemId, before, PAGE);
    for (const row of window.rows) {
      if (row.rev <= input.baseRev) return false;
      if (SAME_CONTENT.has(row.op)) continue;
      if (row.via !== 'mount' || row.deviceId !== input.nodeId) return true;
    }
    if (window.next === null) return false;
    before = window.next;
  }
}

export const DRIVE_CHANGED_ELSEWHERE_UNIT = storeUnit((store, input: ElsewhereInput) =>
  changedElsewhereIn(store, input),
);

export interface MountPathInput {
  readonly driveId: string;
  readonly ino: number;
  readonly name: string | null;
}

export function mountPathIn(store: Store, input: MountPathInput): string | null {
  const inode = store.driveInodes.find(input.ino);
  if (inode?.rootId !== input.driveId) return null;
  if (inode.isRoot) return input.name ?? '';
  const id = store.driveInodes.names(input.ino)[0];
  const item = id === undefined ? undefined : store.driveItems.find(id, null);
  if (item === undefined) return null;
  return input.name === null ? item.relPath : `${item.relPath}/${input.name}`;
}

export const DRIVE_MOUNT_PATH_UNIT = storeUnit((store, input: MountPathInput) =>
  mountPathIn(store, input),
);

export interface PushWindowInput {
  readonly rootId: string;
  readonly after: number;
  readonly limit: number;
  readonly baseId: string | null;
  readonly caller: DriveActor;
}

export interface PushRow {
  readonly row: DriveFeedRow;
  readonly placed: DriveItemSpot | undefined;
  readonly state: 'gone' | 'hidden' | 'visible';
}

export interface PushWindow {
  readonly latest: number;
  readonly base: string | null;
  readonly rows: readonly PushRow[];
}

export function pushWindowIn(store: Store, input: PushWindowInput): PushWindow {
  const latest = store.driveFeed.latestSeqInRoot(input.rootId);
  const base =
    input.baseId === null ? null : (store.driveItems.find(input.baseId, null)?.relPath ?? null);
  if (input.after > latest) return { latest, base, rows: [] };
  const root = store.driveRoots.byId(input.rootId);
  const window = store.driveFeed.sinceInRoot(input.rootId, input.after, input.limit);
  const rows = window.rows.map((row): PushRow => {
    const placed = store.driveItems.lookups.spot(row.itemId);
    const item = placed === undefined ? undefined : store.driveItems.find(row.itemId, null);
    if (item === undefined) return { row, placed, state: 'gone' };
    const visible = itemAccess(store, input.caller, root, item) !== 'none';
    return { row, placed, state: visible ? 'visible' : 'hidden' };
  });
  return { latest, base, rows };
}

export const DRIVE_MOUNT_PUSH_WINDOW_UNIT = storeUnit((store, input: PushWindowInput) =>
  pushWindowIn(store, input),
);

export interface SpotInput {
  readonly rootId: string;
  readonly relPath: string;
}

export interface NotedSpot {
  readonly itemId: string;
  readonly ino: number;
  readonly parent: number;
  readonly name: string;
  readonly relPath: string;
}

export function spotIn(store: Store, input: SpotInput): NotedSpot | null {
  const item = store.driveItems.byPath(input.rootId, input.relPath, null);
  if (item === undefined) return null;
  const inode = store.driveInodes.ofItem(item.id);
  if (inode === undefined) return null;
  const parent =
    item.parentId === null
      ? store.driveInodes.rootOf(item.rootId)
      : store.driveInodes.ofItem(item.parentId);
  if (parent === undefined) return null;
  return {
    itemId: item.id,
    ino: inode.id,
    parent: parent.id,
    name: item.name,
    relPath: item.relPath,
  };
}

export const DRIVE_MOUNT_SPOT_UNIT = storeUnit((store, input: SpotInput) => spotIn(store, input));
