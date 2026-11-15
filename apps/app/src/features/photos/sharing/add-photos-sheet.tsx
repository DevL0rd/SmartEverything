import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveAlbum } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { PHOTO_ALL } from '../data/keys';
import { addToAlbum } from '../library/actions';
import { LibraryGrid } from '../library/library-grid';
import { LibraryError, LibraryLoading } from '../library/library-states';
import { useLibraryFeed, type LibraryFeed } from '../library/use-library-feed';
import { useMediaActions } from '../library/use-media-actions';
import { invalidateSharing } from './queries';

interface PickerProps {
  readonly feed: LibraryFeed;
  readonly controls: MediaSelectionControls;
}

function Picker({ feed, controls }: PickerProps): ReactNode {
  const media = useMediaActions();
  const [step, setStep] = useState<MediaZoomStep>('days');
  const { begin } = controls;
  const { active } = controls.selection;
  useEffect(() => {
    if (!active) begin();
  }, [active, begin]);
  if (feed.state === 'error' && feed.tiles.length === 0) {
    return <LibraryError onRetry={feed.retry} />;
  }
  if (feed.state === 'loading' && feed.tiles.length === 0) return <LibraryLoading />;
  return (
    <View className="-mx-gutter min-h-96 flex-1">
      <LibraryGrid
        tiles={feed.tiles}
        step={step}
        onStep={setStep}
        selection={controls}
        media={media}
        empty={
          <EmptyState
            icon="image"
            title="No photos yet"
            body="Upload or back up photos, then add them here."
          />
        }
        footer={<View />}
        onEnd={feed.onEnd}
      />
    </View>
  );
}

function Footer({
  album,
  picked,
  onDone,
}: {
  readonly album: DriveAlbum;
  readonly picked: readonly string[];
  readonly onDone: () => void;
}): ReactNode {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const add = (): void => {
    setBusy(true);
    background(
      addToAlbum(picked, album).then((added) => {
        setBusy(false);
        if (!added) return;
        invalidateSharing(client);
        onDone();
      }),
      'photos.album.contribute_failed',
      { albumId: album.id },
    );
  };
  return (
    <View className="w-full flex-row flex-wrap items-center gap-2 self-stretch">
      <Text variant="label" className="min-w-0 flex-1 tabular-nums">
        {picked.length === 0 ? 'Choose photos from your library' : `${count(picked.length)} chosen`}
      </Text>
      <Button
        label="Add to album"
        icon="plus"
        variant="filled"
        disabled={picked.length === 0}
        loading={busy}
        onPress={add}
      />
    </View>
  );
}

function OpenSheet({
  album,
  onClose,
}: {
  readonly album: DriveAlbum;
  readonly onClose: () => void;
}): ReactNode {
  const feed = useLibraryFeed(PHOTO_ALL);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const picked = feed.tiles
    .filter((tile) => controls.selection.ids.has(tile.id) && !tile.local)
    .map((tile) => tile.id);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Add photos to ${album.title}`}
      large
      scroll={false}
      detents={['full']}
      footer={<Footer album={album} picked={picked} onDone={onClose} />}
    >
      <Picker feed={feed} controls={controls} />
    </Sheet>
  );
}

export function AddPhotosSheet({
  album,
  open,
  onClose,
}: {
  readonly album: DriveAlbum;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return open ? <OpenSheet album={album} onClose={onClose} /> : null;
}
