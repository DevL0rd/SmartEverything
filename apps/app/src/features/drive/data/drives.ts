import { useMemo } from 'react';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { useProfiles } from '../../../store/people';
import { useSession } from '../../../store/selectors';
import {
  driveOfItemView,
  ownDriveOf,
  sharedDriveOf,
  type DriveOfItem,
} from '../model/drive-access';
import { driveChipsOf, type DriveChipOf } from '../model/drive-chip';
import { flattenPages } from './pages';
import { useSharedWithMe } from './queries';
import { useDriveGrantRows, useDriveRoots } from './tables';

export function useViewerId(): string | null {
  return useSession().client.profile_id;
}

export function useMyDrive(): DriveRoot | null {
  return ownDriveOf(useDriveRoots(), useViewerId());
}

export function useSharedDrive(): DriveRoot | null {
  return sharedDriveOf(useDriveRoots());
}

const NO_DRIVE: DriveOfItem = { root: null, label: null, access: 'none', grantRole: null };

export function useDriveOf(
  item: Pick<DriveItem, 'rootId' | 'id' | 'parentId' | 'kind'> | null,
  ancestorIds: readonly string[] = [],
): DriveOfItem {
  const viewerId = useViewerId();
  const roots = useDriveRoots();
  const grants = useDriveGrantRows();
  const profiles = useProfiles();
  if (item === null) return NO_DRIVE;
  return driveOfItemView({ roots, grants, profiles, viewerId, item, ancestorIds });
}

export function useDriveChips(): DriveChipOf {
  const viewerId = useViewerId();
  const roots = useDriveRoots();
  const profiles = useProfiles();
  const shared = useSharedWithMe().data;
  return useMemo(() => {
    const entries = flattenPages(shared, (page) => page.items);
    return driveChipsOf({
      roots,
      viewerId,
      sharerOfRoot: new Map(entries.map((entry) => [entry.item.rootId, entry.grant.grantedBy])),
      names: new Map(profiles.map((profile) => [profile.id, profile.name])),
    });
  }, [roots, viewerId, profiles, shared]);
}
