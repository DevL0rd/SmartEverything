import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { href } from '../../app-shell/hrefs';
import { Card } from '../../components/card';
import { NavRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { duration } from '../../format/time';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { zoneCount, zoneState } from './presence-model';
import { CELL_METRES, modelFor } from './room-geometry';
import { RoomMap } from './room-map';
import { zoneName } from './room-map-legend';

function delay(seconds: number | null | undefined): string {
  return seconds === null || seconds === undefined ? 'Sensor default' : duration(seconds);
}

function areaOf(sensor: ShellyDevice, zone: ShellyZone): string | null {
  const cells = modelFor(sensor, undefined, false).shapes.get(zone.key)?.cells.size ?? 0;
  return cells === 0 ? null : `${(cells * CELL_METRES * CELL_METRES).toFixed(1)} m²`;
}

function ZoneFacts({
  sensor,
  zone,
}: {
  readonly sensor: ShellyDevice;
  readonly zone: ShellyZone;
}): ReactNode {
  const area = areaOf(sensor, zone);
  return (
    <>
      <List inset title="State">
        <ValueRow title="State" value={zoneState(sensor, zone)} />
        <ValueRow title="Objects" value={zoneCount(sensor, zone)} />
        {area === null ? null : <ValueRow title="Area" value={area} />}
      </List>
      <List inset title="Delays">
        <ValueRow title="Turn on after" value={delay(zone.config.presence_delay)} />
        <ValueRow title="Turn off after" value={delay(zone.config.absence_delay)} />
      </List>
    </>
  );
}

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
      <Card title={zoneName(zone)}>
        <RoomMap sensor={stream.value} selected={zone.key} />
      </Card>
      <ZoneFacts sensor={stream.value} zone={zone} />
      <List inset>
        <NavRow
          title="Edit zone"
          icon="pencil"
          href={{
            pathname: '/device/[deviceId]/settings/[page]',
            params: { deviceId: parent.id, page: 'presence-room', zone: String(zone.config.id) },
          }}
        />
        <NavRow title={parent.label} subtitle="Parent sensor" href={href.device(parent)} />
      </List>
    </View>
  );
}
