import type { ReactElement, ReactNode } from 'react';
import { router } from 'expo-router';
import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { DriveResult } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { MediaGrid } from '../../../components/media-grid/media-grid';
import type { ResolveThumb } from '../../../components/media-grid/tile';
import { useDayKey } from '../../../store/clock';
import { driveLinks, type DrivePages } from '../../drive';
import { tilesOfItems } from './album-items';

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
  header,
}: {
  readonly album: DriveAlbum;
  readonly pages: DrivePages<DriveResult<'listAlbumItems'>>;
  readonly items: readonly DriveItem[];
  readonly header: ReactElement;
}): ReactNode {
  const today = useDayKey();
  const copy = emptyCopy(album);
  return (
    <MediaGrid
      tiles={tilesOfItems(items)}
      step="days"
      today={today}
      header={header}
      empty={<EmptyState icon={album.kind === 'smart' ? 'sparkles' : 'layers'} {...copy} />}
      resolveThumb={resolveThumb}
      onOpen={(tile) => {
        router.push(href.photosItem(tile.id, { album: album.id }));
      }}
      onEndReached={() => {
        if (pages.hasNextPage && !pages.isFetchingNextPage) {
          background(pages.fetchNextPage(), 'photos.album_page_failed', { albumId: album.id });
        }
      }}
    />
  );
}
