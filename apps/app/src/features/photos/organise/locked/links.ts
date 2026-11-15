import { ApiError } from '@smarteverything/domain';
import type { ResolveThumb } from '../../../../components/media-grid/tile';
import { DriveLinkCache, routeGeneration } from '../../../drive';
import { readLockedLinks } from '../api';
import { lockedSession, subscribeLockedSession } from './session';

export const lockedLinks = new DriveLinkCache(
  (itemIds) => {
    const session = lockedSession();
    if (session === null) {
      return Promise.reject(new ApiError('forbidden', 'Unlock the Locked folder first.'));
    }
    return readLockedLinks(session.token, itemIds);
  },
  Date.now,
  routeGeneration,
);

subscribeLockedSession(() => {
  lockedLinks.clear();
});

export const resolveLockedThumb: ResolveThumb = (tile) =>
  lockedLinks.resolve(tile.id, tile.rev, 'thumb');
