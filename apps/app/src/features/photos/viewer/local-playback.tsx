import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { MediaSkeleton } from './media-skeleton';
import { useVideoModule } from './live-photo';
import { PlayerView } from './player-view';

export function LocalPlayback({
  uri,
  durationMs,
  phone,
}: {
  readonly uri: string;
  readonly durationMs: number | null;
  readonly phone: boolean;
}): ReactNode {
  const module = useVideoModule(true);
  if (module === null) return <MediaSkeleton />;
  if (module === 'failed') {
    return (
      <EmptyState
        icon="film"
        title="The video player did not load"
        body="This device could not load the video player."
      />
    );
  }
  return (
    <PlayerView
      module={module}
      source={uri}
      phone={phone}
      lengthSeconds={durationMs === null ? 0 : durationMs / 1000}
      failed={
        <EmptyState
          icon="film"
          title="This video cannot play here"
          body="This device could not play the video."
        />
      }
      onScrubbing={() => undefined}
    />
  );
}
