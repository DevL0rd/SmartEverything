import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { DriveResult } from '../../../api/drive';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { DrivePages } from '../../drive';
import { LibraryGrid } from '../library/library-grid';
import type { MediaActions } from '../library/use-media-actions';
import { useContributorBadges } from '../sharing/contributor-badge';

export function emptyCopy(album: DriveAlbum): { readonly title: string; readonly body: string } {
  if (album.kind === 'smart') {
    return {
      title: 'Nothing matches yet',
      body: 'New photos that match the rules land here by themselves. Edit the rules to widen them.',
    };
  }
  return {
    title: 'This album is empty',
    body: 'Choose Add photos to pick photos and videos from your library.',
  };
}

function AlbumEmpty({
  album,
  onAdd,
}: {
  readonly album: DriveAlbum;
  readonly onAdd: (() => void) | null;
}): ReactElement {
  return (
    <EmptyState
      icon={album.kind === 'smart' ? 'sparkles' : 'layers'}
      {...emptyCopy(album)}
      {...(onAdd === null
        ? {}
        : { action: <Button label="Add photos" icon="plus" variant="tonal" onPress={onAdd} /> })}
    />
  );
}

export function AlbumFeed({
  album,
  pages,
  items,
  tiles,
  controls,
  media,
  header,
  onAdd,
}: {
  readonly album: DriveAlbum;
  readonly pages: DrivePages<DriveResult<'listAlbumItems'>>;
  readonly items: readonly DriveItem[];
  readonly tiles: readonly MediaTile[];
  readonly controls: MediaSelectionControls;
  readonly media: MediaActions;
  readonly header: ReactElement;
  readonly onAdd: (() => void) | null;
}): ReactNode {
  const [step, setStep] = useState<MediaZoomStep>('days');
  const badgeOf = useContributorBadges(album, items);
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <LibraryGrid
        tiles={tiles}
        step={step}
        onStep={setStep}
        selection={controls}
        media={media}
        header={header}
        empty={<AlbumEmpty album={album} onAdd={onAdd} />}
        footer={<View className="h-4" />}
        viewer={{ albumId: album.id }}
        {...(badgeOf === undefined ? {} : { badgeOf })}
        onEnd={() => {
          if (pages.hasNextPage && !pages.isFetchingNextPage) {
            background(pages.fetchNextPage(), 'photos.album_page_failed', { albumId: album.id });
          }
        }}
      />
    </View>
  );
}
