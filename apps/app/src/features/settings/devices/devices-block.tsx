import type { ReactNode } from 'react';
import { PROVIDER_INFO, roomNameOf } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';
import { hiddenDevices } from './hidden-devices';

export function DevicesBlock(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const hidden = hiddenDevices(devices);
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
