import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { useControl } from '../../../store/control';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';

interface Media {
  readonly title: string;
  readonly artist: string | null;
  readonly player: string;
  readonly playing: boolean;
}

export function useMedia(deviceId: string): Media | null {
  return useComputerSelect(
    deviceId,
    (parts): Media | null => {
      const media = parts.session?.media ?? null;
      if (media === null) return null;
      return {
        title: media.title ?? media.player,
        artist: media.artist,
        player: media.player,
        playing: media.status === 'playing',
      };
    },
    sameJson,
  );
}

export function NowPlayingRow({
  deviceId,
  disabled,
  compact,
}: {
  readonly deviceId: string;
  readonly disabled: boolean;
  readonly compact: boolean;
}): ReactNode {
  const media = useMedia(deviceId);
  const playback = useControl(deviceId, 'playback');
  if (media === null) return null;
  return (
    <View className="flex-row items-center gap-3">
      {compact ? null : <IconWell icon="music" colour="viz-blue" size="m" />}
      <View className="min-w-0 flex-1">
        <Text variant={compact ? 'callout' : 'body-strong'} numberOfLines={compact ? 1 : 2}>
          {media.title}
        </Text>
        <Text variant={compact ? 'caption' : 'footnote'} tone="variant" numberOfLines={1}>
          {joinParts([media.artist, media.player])}
        </Text>
      </View>
      <IconButton
        icon={media.playing ? 'pause' : 'play'}
        label={`${media.playing ? 'Pause' : 'Play'} ${media.player}`}
        variant="tonal"
        disabled={disabled}
        onPress={() => {
          background(
            playback.set(media.playing ? 'paused' : 'playing'),
            'computer.playback_failed',
          );
        }}
      />
    </View>
  );
}
