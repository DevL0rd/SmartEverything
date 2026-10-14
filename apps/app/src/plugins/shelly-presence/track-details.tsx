import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { List } from '../../components/section';
import { ValueRow } from '../../components/rows';
import { Text } from '../../components/text';
export function TrackDetails({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {sensor.tracksAt === null
          ? 'Waiting for a tracking frame'
          : `Tracking frame ${new Date(sensor.tracksAt).toLocaleTimeString()}`}
      </Text>
      <List title="Live detected objects">
        {sensor.tracks.map((track) => (
          <ValueRow
            key={track.id}
            title={`Object ${String(track.id)}`}
            value={`x ${String(track.x)} m · y ${String(track.y)} m · z ${String(track.z)} m${track.minz === undefined ? '' : ` · min z ${String(track.minz)} m`}${track.maxz === undefined ? '' : ` · max z ${String(track.maxz)} m`}`}
          />
        ))}
      </List>
    </View>
  );
}
