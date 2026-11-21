import type { DriveItem } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import { repathItem, type RepathChange, type RepathTarget } from '../service-write-repath';

export interface RepathInput {
  readonly item: DriveItem;
  readonly target: RepathTarget;
  readonly change: RepathChange;
}

export interface SyncRelocateInput extends RepathInput {
  readonly carried: readonly DriveBlocks[];
}

export const DRIVE_REPATH_UNIT = storeUnit((store, input: RepathInput) => {
  repathItem({ store }, input.item, input.target, input.change);
});

export const DRIVE_SYNC_RELOCATE_UNIT = storeUnit((store, input: SyncRelocateInput) => {
  repathItem({ store }, input.item, input.target, input.change);
  for (const blocks of input.carried) {
    const now = store.driveItems.find(blocks.itemId, null);
    if (now === undefined || now.rev === blocks.rev) continue;
    store.driveBlocks.put({ ...blocks, rev: now.rev });
    store.driveBlocks.removeBefore(now.id, now.rev);
  }
});
