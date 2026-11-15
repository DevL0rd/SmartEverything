import type { DriveItem } from '@smarteverything/domain';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { DriveStacksRepository } from '../../store/repositories/drive-stacks';
import type { EditDeps } from './deps';

export function stackWithOriginal(deps: EditDeps, original: DriveItem, copy: DriveItem): void {
  const media = new DriveMediaRepository(deps.store.context);
  const stacks = new DriveStacksRepository(deps.store.context);
  for (const id of [original.id, copy.id]) {
    if (media.find(id) === undefined) {
      media.save({
        item_id: id,
        time_source: 'modified',
        tz_offset_min: null,
        thumbhash: null,
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
  const stackId = media.byId(original.id).stack_id ?? stacks.create('burst', original.id).id;
  media.assignStack([original.id, copy.id], stackId);
}
