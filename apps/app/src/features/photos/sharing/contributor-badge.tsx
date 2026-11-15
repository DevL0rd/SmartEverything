import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum, DriveItem, ProfileRow } from '@smarteverything/domain';
import type { TileBadge } from '../../../components/media-grid/tile';
import { useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { sharesAlbum } from './album-bar';
import { usePhotoSharing } from './queries';

export function addersOf(
  items: readonly Pick<DriveItem, 'id' | 'addedByProfileId'>[],
  profiles: readonly ProfileRow[],
): ReadonlyMap<string, ProfileRow> {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return new Map(
    items.flatMap((item) => {
      const profile = item.addedByProfileId === null ? undefined : byId.get(item.addedByProfileId);
      return profile === undefined ? [] : [[item.id, profile] as const];
    }),
  );
}

function ContributorBadge({ profile }: { readonly profile: ProfileRow }): ReactNode {
  return (
    <View className="rounded-full border-2 border-surface-1">
      <ProfileAvatar profile={profile} size="s" />
    </View>
  );
}

export function contributorBadges(adders: ReadonlyMap<string, ProfileRow>): TileBadge {
  return function badgeOf(tile) {
    const profile = adders.get(tile.id);
    return profile === undefined ? null : <ContributorBadge profile={profile} />;
  };
}

export function useContributorBadges(
  album: DriveAlbum,
  items: readonly DriveItem[],
): TileBadge | undefined {
  const profiles = useProfiles();
  const shared = usePhotoSharing().data?.albums.find((entry) => entry.albumId === album.id);
  if (!sharesAlbum(album) || shared === undefined || shared.members.length === 0) {
    return undefined;
  }
  return contributorBadges(addersOf(items, profiles));
}
