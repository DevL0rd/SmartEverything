import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SHELLY_PAGES } from '@smarteverything/shelly';
import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { href } from '../../app-shell/hrefs';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { LiveRoomMap } from './live-room-map';
import { usePresence } from './presence-data';
import { ReauthPrompt } from './reauth-prompt';
import { lightText, zoneCount, zoneState } from './presence-model';
import { lightWord, Swatch, useZoneColours, zoneName } from './room-map-legend';

export function PresenceHero({ device }: { readonly device: Device }): ReactNode {
  const stream = usePresence(device);
  if (stream.state === 'ready')
    return (
      <LiveRoomMap
        sensor={stream.value}
        addZone={href.settings.device(device.id, 'presence-room')}
      />
    );
  return (
    <Card>
      <Skeleton shape="block" className="h-60" />
      <Text variant="callout" tone="variant">
        {stream.state === 'invalid' ? stream.reason : 'Waiting for the sensor'}
      </Text>
    </Card>
  );
}

function zoneSubtitle(sensor: ShellyDevice, zone: ShellyZone): string {
  const state = zoneState(sensor, zone);
  if (state === 'Disabled') return 'Detection off';
  if (state !== 'Occupied') return state;
  const count = zoneCount(sensor, zone);
  return count === '1' ? 'Occupied · 1 object' : `Occupied · ${count} objects`;
}

function addZoneReason(sensor: ShellyDevice): string | null {
  const feature = sensor.features.find((entry) => entry.id === 'add_zone');
  return feature?.available === true ? null : (feature?.reason ?? 'This sensor cannot add zones.');
}

function ZoneList({
  sensor,
  device,
}: {
  readonly sensor: ShellyDevice;
  readonly device: Device;
}): ReactNode {
  const devices = useDevices({ includeHidden: true });
  const colours = useZoneColours(sensor);
  const room = href.settings.device(device.id, 'presence-room');
  const reason = addZoneReason(sensor);
  return (
    <List inset title="Zones">
      {sensor.zones.map((zone) => {
        const child = devices.find((item) => item.external_id === zone.externalId);
        return (
          <ListRow
            key={zone.key}
            title={zoneName(zone)}
            subtitle={zoneSubtitle(sensor, zone)}
            leading={
              <Swatch
                colour={colours.get(zone.key) ?? ''}
                off={zone.config.enable === false}
                size={20}
              />
            }
            chevron
            href={zone.main || child === undefined ? room : href.device(child)}
          />
        );
      })}
      <ListRow
        title="Add zone"
        {...(reason === null ? {} : { subtitle: reason })}
        icon="plus"
        chevron
        disabled={reason !== null}
        href={room}
      />
    </List>
  );
}

function LightList({
  sensor,
  device,
}: {
  readonly sensor: ShellyDevice;
  readonly device: Device;
}): ReactNode {
  return (
    <List inset title="Light">
      <NavRow
        title={lightWord(sensor) ?? 'Light unknown'}
        subtitle={lightText(sensor)}
        icon="sun"
        value="Thresholds"
        href={href.settings.device(device.id, 'presence-light')}
      />
    </List>
  );
}

function SettingsList({ device }: { readonly device: Device }): ReactNode {
  return (
    <List inset title="Settings">
      <NavRow
        title="Room and zones"
        icon="grid"
        href={href.settings.device(device.id, 'presence-room')}
      />
      <NavRow
        title="Detection and mounting"
        icon="locate"
        href={href.settings.device(device.id, 'presence-detection')}
      />
      <NavRow
        title="All settings"
        subtitle={`${String(SHELLY_PAGES.length)} pages`}
        icon="settings"
        href={href.settings.device(device.id)}
      />
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
  return (
    <View className="gap-section-gap">
      <ReauthPrompt sensor={stream.value} />
      <ZoneList sensor={stream.value} device={device} />
      <LightList sensor={stream.value} device={device} />
      <SettingsList device={device} />
    </View>
  );
}
