import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Card } from '../../components/card';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Badge } from '../../components/badge';
import { EmptyState } from '../../components/empty-state';
import { href } from '../../app-shell/hrefs';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { lightText, shownZone, zoneCount, zoneState } from './presence-model';
import { RadarVisual } from './presence-card';
import { LiveRoomMap } from './live-room-map';

function HeroReadings({
  sensor,
  device,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly device: Device;
}): ReactNode {
  const zone = shownZone(sensor, device);
  const state = zoneState(sensor, zone);
  return (
    <>
      <View className="flex-row justify-center">
        <Badge label={state} tone={state === 'Occupied' ? 'primary' : 'neutral'} />
      </View>
      <Figure value={zoneCount(sensor, zone)} unit="detected" size="l" />
      <Text variant="callout" tone="variant">
        {lightText(sensor)}
      </Text>
      {sensor.connection.reason === null ? null : (
        <Text tone="variant">{sensor.connection.reason}</Text>
      )}
    </>
  );
}

export function PresenceHero({ device }: { readonly device: Device }): ReactNode {
  const stream = usePresence(device);
  return (
    <Card>
      <View className="items-center gap-3 py-2">
        <RadarVisual large />
        {stream.state === 'ready' ? (
          <HeroReadings sensor={stream.value} device={device} />
        ) : (
          <>
            <View className="flex-row justify-center">
              <Badge label="Unknown" tone="neutral" />
            </View>
            <Figure value="—" unit="detected" size="l" />
            <Text tone="variant">Waiting for this sensor</Text>
          </>
        )}
      </View>
    </Card>
  );
}

function ZoneList({
  sensor,
  device,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly device: Device;
}): ReactNode {
  const devices = useDevices({ includeHidden: true });
  return (
    <List title="Zones">
      {sensor.zones.map((zone) => {
        const child = devices.find((item) => item.external_id === zone.externalId);
        return (
          <NavRow
            key={zone.key}
            title={zone.config.name ?? (zone.main ? 'Main zone' : zone.key)}
            subtitle={`${zoneState(sensor, zone)} · ${zoneCount(sensor, zone)} detected`}
            href={
              zone.main || child === undefined
                ? href.settings.device(device.id, 'presence-room')
                : href.device(child)
            }
          />
        );
      })}
    </List>
  );
}

export function PresenceOverview({ device }: { readonly device: Device }): ReactNode {
  const stream = usePresence(device);
  if (stream.state !== 'ready')
    return (
      <EmptyState
        icon="motion"
        title="Waiting for the room map"
        body={
          stream.state === 'invalid'
            ? stream.reason
            : 'The sensor has not sent a configuration yet.'
        }
      />
    );
  const sensor = stream.value;
  return (
    <View className="gap-section-gap">
      <Card title="Room and zones">
        <LiveRoomMap sensor={sensor} />
        <NavRow
          title="Edit room and zones"
          href={href.settings.device(device.id, 'presence-room')}
        />
      </Card>
      <ZoneList sensor={sensor} device={device} />
      <List title="Light">
        <NavRow
          title={lightText(sensor)}
          subtitle="Sensor thresholds and indicator"
          href={href.settings.device(device.id, 'presence-light')}
        />
      </List>
    </View>
  );
}
