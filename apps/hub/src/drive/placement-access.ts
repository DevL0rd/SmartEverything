import type { DrivePlacement } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { driveAccess, itemAccess, type DriveActor, type ItemAccess } from './access';

export type PlacementAccessStore = Pick<
  Store,
  'driveRoots' | 'driveItems' | 'driveGrants' | 'computerNodes'
>;

export type PlacementTarget = Pick<DrivePlacement, 'rootId' | 'folderItemId'>;

export function computerActor(store: PlacementAccessStore, deviceId: string): DriveActor | null {
  const profileId = store.computerNodes.personOf(deviceId);
  return profileId === null ? null : { profileId };
}

export function targetAccess(
  store: PlacementAccessStore,
  actor: DriveActor,
  target: PlacementTarget,
): ItemAccess {
  const drive = store.driveRoots.find(target.rootId);
  if (drive === undefined) return 'none';
  if (target.folderItemId === null) return driveAccess(actor, drive);
  const folder = store.driveItems.find(target.folderItemId, null);
  if (folder?.rootId !== target.rootId) return 'none';
  return itemAccess(store, actor, drive, folder);
}

export function placementAccess(
  store: PlacementAccessStore,
  placement: Pick<DrivePlacement, 'deviceId' | 'rootId' | 'folderItemId'>,
): ItemAccess {
  const actor = computerActor(store, placement.deviceId);
  return actor === null ? 'none' : targetAccess(store, actor, placement);
}
