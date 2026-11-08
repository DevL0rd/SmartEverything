import { useState, type ReactNode } from 'react';
import type { Memory, PhotosPref } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { useAreaWidth } from '../../../design/size-class';
import { PREFS, usePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoMemories, usePhotoTrips } from '../data';
import { BoardSkeleton, MemoriesBoard, type TripsState } from './memories-board';
import { MemoryPlayer } from './memory-player';
import { boardIsEmpty, boardOf } from './model';

export const MEMORIES_SUBTITLE = 'On this day, trips and your years, made from your own photos';

export const MEMORIES_COPY = {
  off: {
    title: 'Memories are off',
    body: 'Turn Memories on in Photos settings to see on this day, days out and trips.',
    action: 'Open settings',
  },
  empty: {
    title: 'No memories yet',
    body: 'Memories appear once Photos has pictures from earlier years, days out or trips.',
    action: 'Open Timeline',
  },
  offline: {
    title: 'The hub is offline',
    body: 'These are the memories from your last visit. They update when the hub is back.',
  },
} as const;

function usePhotosPrefs(): PhotosPref {
  const read = usePref(PREFS.photos);
  return read.status === 'invalid' ? PREFS.photos.defaultValue : read.value;
}

function useTrips(): TripsState {
  const trips = usePhotoTrips();
  return {
    trips: trips.data ?? [],
    loading: trips.isPending,
    error: trips.data === undefined ? trips.error : null,
    settled: trips.data !== undefined,
    retry: (): void => {
      background(trips.refetch(), 'photos.trips_refetch_failed');
    },
  };
}

function Off(): ReactNode {
  const copy = MEMORIES_COPY.off;
  return (
    <EmptyState
      icon="clock"
      title={copy.title}
      body={copy.body}
      action={<Button label={copy.action} href={href.settings.page('photos')} />}
    />
  );
}

function Empty(): ReactNode {
  const copy = MEMORIES_COPY.empty;
  return (
    <EmptyState
      icon="clock"
      title={copy.title}
      body={copy.body}
      action={<Button label={copy.action} variant="tonal" href={href.photos()} />}
    />
  );
}

function Body({
  prefs,
  compact,
  onPlay,
}: {
  readonly prefs: PhotosPref;
  readonly compact: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const memories = usePhotoMemories();
  const trips = useTrips();
  if (memories.data === undefined) {
    if (memories.error !== null) {
      return (
        <ErrorState
          error={memories.error}
          retry={() => {
            background(memories.refetch(), 'photos.memories_refetch_failed');
          }}
        />
      );
    }
    return <BoardSkeleton />;
  }
  const board = boardOf(memories.data, prefs.yearInReview);
  if (trips.settled && boardIsEmpty(board, trips.trips)) {
    return <Empty />;
  }
  return <MemoriesBoard board={board} trips={trips} compact={compact} onPlay={onPlay} />;
}

export function MemoriesScreen(): ReactNode {
  const prefs = usePhotosPrefs();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const offline = useSyncStatus().status === 'interrupted';
  const [playing, setPlaying] = useState<Memory | null>(null);
  return (
    <PhotosFrame active="memories" subtitle={MEMORIES_SUBTITLE}>
      {offline ? (
        <Banner
          tone="warning"
          title={MEMORIES_COPY.offline.title}
          body={MEMORIES_COPY.offline.body}
          wrapBody
        />
      ) : null}
      {prefs.memories ? <Body prefs={prefs} compact={compact} onPlay={setPlaying} /> : <Off />}
      {playing === null ? null : (
        <MemoryPlayer
          key={playing.id}
          memory={playing}
          compact={compact}
          onClose={() => {
            setPlaying(null);
          }}
        />
      )}
    </PhotosFrame>
  );
}
