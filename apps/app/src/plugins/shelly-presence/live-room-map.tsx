import { TrackDetails } from './track-details';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { RoomMap } from './room-map';
import { presenceActionAvailable } from './availability';
import { useLiveView } from './use-live-view';

export function LiveRoomMap({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const live = useLiveView(sensor);
  return (
    <View className="gap-3">
      <RoomMap sensor={sensor} live={live.active} />
      <View className="flex-row flex-wrap items-center gap-3">
        <Button
          label={live.enabled ? 'End live view' : 'Live view'}
          icon={live.enabled ? 'pause' : 'play'}
          variant="tonal"
          disabled={
            sensor.connection.state !== 'online' || !presenceActionAvailable(sensor, 'live_track')
          }
          onPress={live.toggle}
        />
        <Text variant="footnote" tone="variant">
          {live.active && live.expiresAt !== null
            ? `Session until ${new Date(live.expiresAt).toLocaleTimeString()}`
            : 'Live view ended'}
        </Text>
      </View>
      {live.active ? <TrackDetails sensor={sensor} /> : null}
      {live.error === null ? null : <Text tone="critical">{live.error}</Text>}
    </View>
  );
}
