import { ApiError } from '@smarteverything/domain';
import { DriveLinkCache, routeGeneration, thumbLinksOf } from '../../../drive';
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

export const lockedThumbs = thumbLinksOf(lockedLinks);
