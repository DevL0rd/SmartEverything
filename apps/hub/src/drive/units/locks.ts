import { ApiError, type DriveItem, type DriveLockSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { canRead, canShare, itemAccess, type DriveActor } from '../access';
import { takenMonths } from '../changes-months';

const log = new Logger('hub.drive');

type LocksStore = Pick<
  Store,
  'driveGrants' | 'driveItems' | 'driveRoots' | 'driveLocks' | 'driveFeed' | 'feed'
>;

function setLock(store: LocksStore, actor: DriveActor, input: DriveLockSet): DriveItem {
  const item = store.driveItems.find(input.itemId, actor.profileId);
  const access =
    item === undefined
      ? 'none'
      : itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
  if (item === undefined || !canRead(access)) {
    throw new ApiError('not_found', 'There is no such file or folder for this caller.');
  }
  if (!canShare(access)) {
    throw new ApiError('forbidden', 'Only the person whose drive this is can make it view only.');
  }
  if (store.driveRoots.byId(item.rootId).scope === 'home') {
    throw new ApiError(
      'invalid_request',
      'Everyone in the home owns the Shared Drive, so nothing in it is view only.',
    );
  }
  if (store.driveLocks.isSet(item.id) !== input.locked) {
    store.driveLocks.set(item.id, actor.profileId, input.locked);
    log.info('drive_lock.set', { itemId: item.id, locked: input.locked, by: actor.profileId });
  }
  const after = store.driveItems.byId(item.id, actor.profileId);
  store.feed.notice({
    type: 'drive_changed',
    rootIds: [after.rootId],
    folderIds: [
      ...(after.kind === 'folder' ? [after.id] : []),
      ...(after.parentId === null ? [] : [after.parentId]),
    ],
    albumIds: [],
    months: takenMonths([after]),
    cursor: store.driveFeed.latestSeq(),
  });
  return after;
}

export const DRIVE_LOCK_SET_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly lock: DriveLockSet }) =>
    setLock(store, input.actor, input.lock),
);
