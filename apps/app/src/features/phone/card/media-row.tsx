import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { API_ENDPOINTS as E, type PhoneAction } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';

type MediaKey = Extract<PhoneAction, { readonly type: 'media' }>['key'];

function useMediaKey(device: Device): (key: MediaKey) => void {
  return (key) => {
    background(
      api()
        .call(E.runPhoneAction, { params: { deviceId: device.id }, body: { type: 'media', key } })
        .catch(notifyFailure(`${device.label} did not take that`)),
      'phone.media_failed',
    );
  };
}

function Transport({
  device,
  playing,
  wide,
}: {
  readonly device: Device;
  readonly playing: boolean;
  readonly wide: boolean;
}): ReactNode {
  const playback = useControl(device.id, 'playback');
  const press = useMediaKey(device);
  return (
    <View className="flex-row items-center">
      {wide ? (
        <IconButton
          icon="chevronLeft"
          label="Previous"
          onPress={() => {
            press('previous');
          }}
        />
      ) : null}
      <IconButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? 'Pause' : 'Play'}
        variant="tonal"
        onPress={() => {
          background(playback.set(playing ? 'paused' : 'playing'), 'phone.playback_failed');
        }}
      />
      {wide ? (
        <IconButton
          icon="chevronRight"
          label="Next"
          onPress={() => {
            press('next');
          }}
        />
      ) : null}
    </View>
  );
}

export const NowPlayingRow = memo(function NowPlayingRow({
  device,
  playing,
  title,
  wide,
}: {
  readonly device: Device;
  readonly playing: boolean;
  readonly title: string | null;
  readonly wide: boolean;
}): ReactNode {
  return (
    <View className="min-h-9 flex-row items-center gap-2" pointerEvents="box-none">
      <Icon name="music" size={20} tone="variant" />
      <View className="min-w-0 flex-1" pointerEvents="none">
        <Text variant="callout" tone={title === null ? 'faint' : 'default'} numberOfLines={1}>
          {title ?? 'Nothing playing'}
        </Text>
      </View>
      {title === null ? null : <Transport device={device} playing={playing} wide={wide} />}
    </View>
  );
});
