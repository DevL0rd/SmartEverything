import {
  ApiError,
  type DriveFeedOp,
  type DriveItem,
  type DriveOfflineReport,
  type DriveOfflineSet,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { canRead, itemAccess, mayExport, type DriveActor } from '../access';
import { requireExport } from '../sharing/export-guard';

const FEED_BATCH = 500;

const CHANGING: ReadonlySet<DriveFeedOp> = new Set([
  'create',
  'update',
  'rename',
  'move',
  'restore',
  'trash',
]);

type OfflineStore = Pick<
  HostStore,
  | 'clients'
  | 'profiles'
  | 'driveOffline'
  | 'driveItems'
  | 'driveRoots'
  | 'driveGrants'
  | 'driveFeed'
>;

export interface OfflineChange {
  readonly clientId: string;
  readonly itemId: string;
}

export type OfflineGathered =
  | { readonly kind: 'idle'; readonly latest: number }
  | {
      readonly kind: 'page';
      readonly last: number | null;
      readonly more: boolean;
      readonly changes: readonly OfflineChange[];
    };

function noPhone(): ApiError {
  return new ApiError('not_found', 'There is no phone of yours with that id.');
}

function phoneOf(store: OfflineStore, actor: DriveActor, clientId: string): void {
  const client = store.clients.find(clientId);
  if (client?.platform !== 'android' || store.profiles.activeOf(clientId).id !== actor.profileId) {
    throw noPhone();
  }
}

function setOffline(
  store: OfflineStore,
  { actor, set }: { readonly actor: DriveActor; readonly set: DriveOfflineSet },
): string | null {
  phoneOf(store, actor, set.clientId);
  if (!set.on) {
    store.driveOffline.set(set.clientId, set.itemId, actor.profileId, false);
    return null;
  }
  const item = store.driveItems.find(set.itemId, actor.profileId);
  const access =
    item === undefined
      ? 'none'
      : itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
  if (item === undefined || !canRead(access)) {
    throw new ApiError('not_found', 'There is no such file or folder for this caller.');
  }
  requireExport(access, item);
  store.driveOffline.set(set.clientId, item.id, actor.profileId, true);
  return item.id;
}

function reportOffline(
  store: OfflineStore,
  { actor, report }: { readonly actor: DriveActor; readonly report: DriveOfflineReport },
): void {
  phoneOf(store, actor, report.clientId);
  store.driveOffline.report(report.clientId, report.items);
}

function holds(store: OfflineStore, profileId: string, item: DriveItem): boolean {
  const view = store.driveItems.find(item.id, profileId);
  if (view === undefined) return false;
  const access = itemAccess(store, { profileId }, store.driveRoots.byId(view.rootId), view);
  return canRead(access) && mayExport(access, view.locked);
}

function gather(store: OfflineStore, itemIds: readonly string[]): OfflineChange[] {
  if (itemIds.length === 0) return [];
  const changes: OfflineChange[] = [];
  for (const held of store.driveOffline.holdersOfEach([...new Set(itemIds)])) {
    const item = store.driveItems.find(held.itemId, null);
    if (item === undefined || !holds(store, held.profileId, item)) continue;
    changes.push({ clientId: held.clientId, itemId: item.id });
  }
  return changes;
}

function gatherOffline(store: OfflineStore, input: { readonly after: number }): OfflineGathered {
  if (!store.driveOffline.held()) return { kind: 'idle', latest: store.driveFeed.latestSeq() };
  const window = store.driveFeed.since(input.after, FEED_BATCH);
  return {
    kind: 'page',
    last: window.rows.at(-1)?.seq ?? null,
    more: window.next !== null,
    changes: gather(
      store,
      window.rows.filter((row) => CHANGING.has(row.op)).map((row) => row.itemId),
    ),
  };
}

export const DRIVE_OFFLINE_SET_UNIT = storeUnit(setOffline);

export const DRIVE_OFFLINE_REPORT_UNIT = storeUnit(reportOffline);

export const DRIVE_OFFLINE_GATHER_UNIT = storeUnit(gatherOffline);
