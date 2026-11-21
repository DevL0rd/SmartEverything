import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { DriveMediaRepository, type DriveMediaPatch } from '../../store/repositories/drive-media';
import type { Store } from '../../store/store';

export interface DerivedTarget {
  readonly itemId: string;
  readonly rev: number;
  readonly kind: 'image' | 'video';
}

export interface DerivedRecord {
  readonly target: DerivedTarget;
  readonly thumb: DriveThumb | null;
  readonly patch: DriveMediaPatch;
}

type DerivedItem = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

function currentOf(store: Store, target: DerivedTarget): DerivedItem | undefined {
  const item = store.driveItems.find(target.itemId, null);
  if (item === undefined || (item.kind !== 'image' && item.kind !== 'video')) return undefined;
  if (item.kind !== target.kind || item.rev !== target.rev) return undefined;
  return new DriveMediaRepository(store.context).find(item.id) === undefined ? undefined : item;
}

function writeThumb(store: Store, item: DerivedItem, thumb: DriveThumb): void {
  store.context.sql.run(
    'record the derived media thumbnail',
    'update drive_items set thumb_state = $state, thumb_reason = $reason where id = $itemId',
    { itemId: item.id, state: thumb.state, reason: 'reason' in thumb ? thumb.reason : null },
  );
  store.feed.notice({
    type: 'drive_changed',
    rootIds: [item.rootId],
    folderIds: item.parentId === null ? [] : [item.parentId],
    albumIds: [],
    months: item.takenAt === null ? [] : [item.takenAt.slice(0, 7)],
    cursor: store.driveFeed.latestSeq(),
  });
}

export const PHOTO_DERIVED_CURRENT_UNIT = storeUnit((store, input: DerivedTarget) =>
  currentOf(store, input),
);

export const PHOTO_DERIVED_RECORD_UNIT = storeUnit((store, input: DerivedRecord) => {
  const item = currentOf(store, input.target);
  if (item === undefined) return false;
  if (input.thumb !== null) writeThumb(store, item, input.thumb);
  new DriveMediaRepository(store.context).update(item.id, input.patch);
  return true;
});
