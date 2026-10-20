import type { ReactNode } from 'react';
import { PROVIDER_INFO } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { useListedDevices, useRooms } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';
import { deviceGroups } from './device-groups';

export function DevicesBlock(): ReactNode {
  const devices = useListedDevices();
  const rooms = useRooms();
  const groups = deviceGroups(devices, rooms);
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="bulb"
        title="No devices yet"
        body="Devices you add show up here, hidden ones too."
      />
    );
  }
  return (
    <>
      {groups.map((group) => (
        <List key={group.id} title={group.title} inset>
          {group.devices.map(({ device, name }) => (
            <NavRow
              key={device.id}
              title={name}
              subtitle={joinParts([
                device.hidden ? 'Hidden from Home' : null,
                PROVIDER_INFO[device.provider].name,
                device.online ? null : 'Offline',
              ])}
              icon={deviceIcon(device)}
              href={href.settings.device(device.id)}
            />
          ))}
        </List>
      ))}
    </>
  );
}
