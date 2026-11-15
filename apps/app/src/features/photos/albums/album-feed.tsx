import type { ReactElement, ReactNode } from 'react';
import { router } from 'expo-router';
import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { DriveResult } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { MediaGrid } from '../../../components/media-grid/media-grid';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { ResolveThumb } from '../../../components/media-grid/tile';
import { useDayKey } from '../../../store/clock';
import { driveLinks, type DrivePages } from '../../drive';
import { useContributorBadges } from '../sharing/contributor-badge';

const resolveThumb: ResolveThumb = (tile) => driveLinks.resolve(tile.id, tile.rev, 'thumb');

export function emptyCopy(album: DriveAlbum): { readonly title: string; readonly body: string } {
  if (album.kind === 'smart') {
    return {
      title: 'Nothing matches yet',
      body: 'New photos that match the rules land here by themselves. Edit the rules to widen them.',
    };
  }
  return {
    title: 'This album is empty',
    body: 'Select photos in the Timeline and choose Album to add them here.',
  };
}

export function AlbumFeed({
  album,
  pages,
  items,
  tiles,
  controls,
  header,
}: {
  readonly album: DriveAlbum;
  readonly pages: DrivePages<DriveResult<'listAlbumItems'>>;
  readonly items: readonly DriveItem[];
  readonly tiles: readonly MediaTile[];
  readonly controls: MediaSelectionControls;
  readonly header: ReactElement;
}): ReactNode {
  const today = useDayKey();
  const copy = emptyCopy(album);
  const badgeOf = useContributorBadges(album, items);
  return (
    <MediaGrid
      tiles={tiles}
      step="days"
      today={today}
      header={header}
      empty={<EmptyState icon={album.kind === 'smart' ? 'sparkles' : 'layers'} {...copy} />}
      resolveThumb={resolveThumb}
      {...(badgeOf === undefined ? {} : { badgeOf })}
      onOpen={(tile) => {
        if (!controls.press(tile.id, { shift: false })) {
          router.push(href.photosItem(tile.id, { albumId: album.id }));
        }
      }}
      onEndReached={() => {
        if (pages.hasNextPage && !pages.isFetchingNextPage) {
          background(pages.fetchNextPage(), 'photos.album_page_failed', { albumId: album.id });
        }
      }}
    />
  );
}
