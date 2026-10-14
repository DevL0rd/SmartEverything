import type { ReactNode } from 'react';
import { PROVIDER_INFO, displayName, roomNameOf } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';

export function DevicesBlock(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const entries = devices
    .map((device) => ({ device, name: displayName(device, devices, rooms) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="eye"
        title="No devices yet"
        body="Devices you add appear here, whether shown on Home or hidden."
      />
    );
  }
  return (
    <List title="Devices" inset>
      {entries.map(({ device, name }) => (
        <NavRow
          key={device.id}
          title={name}
          subtitle={joinParts([
            roomNameOf(device, rooms),
            PROVIDER_INFO[device.provider].name,
            device.online ? null : 'Offline',
          ])}
          value={device.hidden ? 'Hidden from Home' : 'Shown on Home'}
          icon={deviceIcon(device)}
          href={href.settings.device(device.id)}
        />
      ))}
    </List>
  );
}
