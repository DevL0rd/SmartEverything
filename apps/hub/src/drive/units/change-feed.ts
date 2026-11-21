import type { DriveFeedOp, DriveItem } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import type { ChangeActor } from '../changes';
import { takenMonths } from '../changes-months';

export function announce(
  env: { readonly store: Pick<HostStore, 'feed' | 'driveItems' | 'driveFeed'> },
  rootId: string,
  parentId: string | null,
  touched: readonly DriveItem[],
): void {
  env.store.feed.notice({
    type: 'drive_changed',
    rootIds: [rootId],
    folderIds: parentId === null ? [] : env.store.driveItems.folderChainOf(parentId),
    albumIds: [],
    months: takenMonths(touched),
    cursor: env.store.driveFeed.latestSeq(),
  });
}

export function appendFeed(
  env: { readonly store: Pick<HostStore, 'driveFeed'> },
  item: DriveItem,
  op: DriveFeedOp,
  actor: ChangeActor,
): void {
  env.store.driveFeed.append({
    rootId: item.rootId,
    itemId: item.id,
    op,
    rev: item.rev,
    actorProfileId: actor.actorProfileId,
    via: actor.via,
    deviceId: actor.deviceId,
  });
}
