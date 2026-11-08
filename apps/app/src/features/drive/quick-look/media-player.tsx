import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MediaPlayerProps } from './media-player-props';

export function MediaPlayer({ kind, label, onOpen }: MediaPlayerProps): ReactNode {
  const video = kind === 'video';
  return (
    <EmptyState
      icon={video ? 'film' : 'music'}
      title={label}
      body={
        video ? 'Videos play in your phone’s video player.' : 'Sound plays in your phone’s player.'
      }
      action={<Button label={video ? 'Play video' : 'Play'} icon="play" onPress={onOpen} />}
    />
  );
}
