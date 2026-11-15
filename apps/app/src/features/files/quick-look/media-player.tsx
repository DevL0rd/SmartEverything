import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { VIEW_ONLY_LINE } from './export-model';
import type { MediaPlayerProps } from './media-player-props';

export function MediaPlayer({ kind, label, viewOnly, onOpen }: MediaPlayerProps): ReactNode {
  const video = kind === 'video';
  if (viewOnly) {
    return <EmptyState icon={video ? 'film' : 'music'} title={label} body={VIEW_ONLY_LINE} />;
  }
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
