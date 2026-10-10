import type { ReactNode } from 'react';
import { PROVIDER_INFO, displayName, roomNameOf } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';

function HiddenList(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const hidden = devices
    .filter((device) => device.hidden)
    .map((device) => ({ device, name: displayName(device, devices, rooms) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (hidden.length === 0) {
    return (
      <EmptyState
        icon="eye"
        title="Nothing hidden"
        body="Devices you hide from Home show up here."
      />
    );
  }
  return (
    <List title="Hidden from Home" inset>
      {hidden.map(({ device, name }) => (
        <NavRow
          key={device.id}
          title={name}
          subtitle={joinParts([
            roomNameOf(device, rooms),
            PROVIDER_INFO[device.provider].name,
            device.online ? null : 'Offline',
          ])}
          icon={deviceIcon(device)}
          href={href.settings.device(device.id)}
        />
      ))}
    </List>
  );
}

export function DevicesBlock(): ReactNode {
  return <HiddenList />;
}
