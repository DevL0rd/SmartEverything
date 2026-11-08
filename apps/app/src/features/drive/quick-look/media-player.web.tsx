import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import type { MediaPlayerProps } from './media-player-props';

export function MediaPlayer({ kind, url, poster, label }: MediaPlayerProps): ReactNode {
  if (kind === 'audio') {
    return (
      <View className="w-full max-w-reading items-center gap-6 p-6">
        <Icon name="music" size={40} tone="variant" />
        <audio src={url} controls preload="metadata" aria-label={label} className="w-full" />
      </View>
    );
  }
  return (
    <video
      src={url}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={label}
      className="h-full w-full object-contain"
    />
  );
}
