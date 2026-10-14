import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { NavRow } from '../../components/rows';
import { Text } from '../../components/text';
import { href } from '../../app-shell/hrefs';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { RoomMap } from './room-map';

export function ZoneOverview({ device }: { readonly device: Device }): ReactNode {
  const stream = usePresence(device);
  const devices = useDevices({ includeHidden: true });
  const parent = devices.find((item) => item.id === device.parent_id);
  if (stream.state !== 'ready' || parent === undefined)
    return <Text tone="variant">The parent sensor is unavailable.</Text>;
  const zone = stream.value.zones.find((item) => item.externalId === device.external_id);
  if (zone === undefined) return <Text tone="variant">This zone was deleted.</Text>;
  return (
    <View className="gap-section-gap">
      <Card title={zone.config.name ?? 'Zone'}>
        <RoomMap sensor={stream.value} area={zone.config.area} />
      </Card>
      <NavRow
        title="Edit this zone"
        href={{
          pathname: '/device/[deviceId]/settings/[page]',
          params: { deviceId: parent.id, page: 'presence-room', zone: String(zone.config.id) },
        }}
      />
      <NavRow title={parent.label} subtitle="Parent sensor" href={href.device(parent)} />
    </View>
  );
}
