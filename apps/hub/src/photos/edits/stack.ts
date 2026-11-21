import type { DriveItem } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { DriveStacksRepository } from '../../store/repositories/drive-stacks';
import type { EditDeps } from './deps';

export function stackWithOriginal(
  deps: EditDeps,
  original: DriveItem,
  copy: DriveItem,
): Promise<void> {
  return deps.store.host.write('photoEditStack', { originalId: original.id, copyId: copy.id });
}

export const PHOTO_EDIT_STACK_UNIT = storeUnit(
  (store, input: { readonly originalId: string; readonly copyId: string }): void => {
    const media = new DriveMediaRepository(store.context);
    const stacks = new DriveStacksRepository(store.context);
    for (const id of [input.originalId, input.copyId]) {
      if (media.find(id) === undefined) {
        media.save({
          item_id: id,
          time_source: 'modified',
          tz_offset_min: null,
          preview_state: 'none',
          preview_reason: null,
          poster_state: 'none',
          poster_reason: null,
          playable_state: 'none',
          playable_reason: null,
          motion_clip_id: null,
          live_id: null,
          burst_id: null,
          stem_key: null,
          stack_id: null,
          place_id: null,
        });
      }
    }
    const stackId =
      media.byId(input.originalId).stack_id ?? stacks.create('burst', input.originalId).id;
    media.assignStack([input.originalId, input.copyId], stackId);
  },
);
