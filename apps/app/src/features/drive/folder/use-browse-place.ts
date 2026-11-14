import { useEffect } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useProfiles } from '../../../store/people';
import { flattenPages, useDriveRoots, useSharedWithMe, useViewerId } from '../data';
import { driveOfRootId } from '../model/drive-access';
import { browsePlaceOf, sharedCoverOf, type BrowsePlace } from './place-model';

export interface PlaceLookup {
  readonly place: BrowsePlace | null;
  readonly pending: boolean;
}

export function useBrowsePlace(rootId: string, folder: DriveItem | null): PlaceLookup {
  const roots = useDriveRoots();
  const viewerId = useViewerId();
  const profiles = useProfiles();
  const foreign = driveOfRootId(roots, rootId) === null && folder !== null;
  const shared = useSharedWithMe(foreign);
  const entries = flattenPages(shared.data, (page) => page.items);
  const cover = folder === null ? null : sharedCoverOf(entries, folder);
  const more = foreign && cover === null && shared.hasNextPage && !shared.isFetchingNextPage;
  useEffect(() => {
    if (more) background(shared.fetchNextPage(), 'drive.shared_cover_failed');
  }, [more, shared]);
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]));
  const place = browsePlaceOf({
    roots,
    viewerId,
    rootId,
    folder,
    cover,
    nameOf: (profileId) => names.get(profileId) ?? null,
  });
  return { place, pending: foreign && cover === null && (shared.isPending || more) };
}
