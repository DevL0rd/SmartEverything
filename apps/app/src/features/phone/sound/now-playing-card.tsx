import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhoneDetail } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { usePhoneAction } from '../data/phone-action';
import { usePhoneLiveHeld } from '../data/phone-live';
import type { PhoneReadings } from '../phone-values';
import { LockLine } from '../screens/detail-parts';
import { mediaProgressOf, mediaSubtitle, mediaTitle, type PhoneMedia } from './sound-model';

function Transport({
  device,
  playing,
  disabled,
}: {
  readonly device: Device;
  readonly playing: boolean;
  readonly disabled: boolean;
}): ReactNode {
  const playback = useControl(device.id, 'playback');
  const send = usePhoneAction(device);
  return (
    <View className="flex-row items-center">
      <IconButton
        icon="chevronLeft"
        label="Previous"
        disabled={disabled}
        onPress={() => {
          send({ type: 'media', key: 'previous' });
        }}
      />
      <IconButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? 'Pause' : 'Play'}
        variant="tonal"
        disabled={disabled}
        onPress={() => {
          background(playback.set(playing ? 'paused' : 'playing'), 'phone.playback_failed');
        }}
      />
      <IconButton
        icon="chevronRight"
        label="Next"
        disabled={disabled}
        onPress={() => {
          send({ type: 'media', key: 'next' });
        }}
      />
    </View>
  );
}

function Progress({
  device,
  media,
  canAct,
}: {
  readonly device: Device;
  readonly media: PhoneMedia;
  readonly canAct: boolean;
}): ReactNode {
  const live = usePhoneLiveHeld(device.id);
  const send = usePhoneAction(device);
  const progress = mediaProgressOf(media);
  if (progress === null || media.durationMs === null || media.positionMs === null) return null;
  const times = `${progress.elapsed} / ${progress.total}`;
  if (!live || !canAct) {
    return (
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <ProgressBar progress={progress.share} colour="viz-1" label={progress.spoken} />
        </View>
        <Text variant="footnote" tone="variant" className="tabular">
          {times}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <Slider
          value={media.positionMs}
          min={0}
          max={media.durationMs}
          step={1000}
          label="Track position"
          formatValue={(ms) => `${String(Math.round(ms / 1000))} s`}
          onCommit={(positionMs) => {
            send({ type: 'seek', positionMs: Math.round(positionMs) });
          }}
        />
      </View>
      <Text variant="footnote" tone="variant" className="tabular">
        {times}
      </Text>
    </View>
  );
}

function titleOf(
  media: PhoneMedia | null,
  readings: PhoneReadings,
  hidden: boolean,
): string | null {
  if (media === null) return readings.nowPlaying;
  const title = mediaTitle(media, readings.nowPlaying);
  if (title !== null || !hidden) return title;
  return media.state === 'playing' ? 'Playing' : 'Paused';
}

export function NowPlayingCard({
  device,
  sound,
  readings,
  canAct,
  person,
  hidden,
}: {
  readonly device: Device;
  readonly sound: PhoneDetail['sound'];
  readonly readings: PhoneReadings;
  readonly canAct: boolean;
  readonly person: string;
  readonly hidden: boolean;
}): ReactNode {
  const media = sound?.media ?? null;
  const playing = readings.playback === 'playing';
  const title = titleOf(media, readings, hidden);
  const subtitle = media === null ? null : mediaSubtitle(media);
  return (
    <Card title="Now playing" icon="music">
      {title === null ? (
        <Text variant="callout" tone="variant">
          Nothing playing
        </Text>
      ) : (
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <IconWell icon="music" colour="viz-2" size="m" />
            <View className="min-w-0 flex-1">
              <Text variant="body-strong" numberOfLines={2}>
                {title}
              </Text>
              {subtitle === null ? null : (
                <Text variant="footnote" tone="variant" numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
            <Transport device={device} playing={playing} disabled={!canAct} />
          </View>
          {media === null ? null : <Progress device={device} media={media} canAct={canAct} />}
          {hidden ? <LockLine text={`Titles stay with ${person}`} /> : null}
        </View>
      )}
    </Card>
  );
}
