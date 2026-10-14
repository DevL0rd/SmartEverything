import type { ReactNode } from 'react';
import { contributedDevicePages } from '../../app-shell/device-pages';
import { href } from '../../app-shell/hrefs';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { useDevice } from '../../store/selectors';
import { DeviceSettingsScreen } from '../devices';

export function ExtendedDeviceSettingsScreen({
  deviceId,
}: {
  readonly deviceId: string;
}): ReactNode {
  const device = useDevice(deviceId);
  const pages = device === null ? [] : contributedDevicePages(device);
  return (
    <DeviceSettingsScreen deviceId={deviceId}>
      {pages.length === 0 ? null : (
        <List title="Computer integrations">
          {pages.map((page) => (
            <NavRow
              key={page.id}
              title={page.title}
              subtitle={page.subtitle}
              icon={page.icon}
              href={href.settings.device(deviceId, page.id)}
            />
          ))}
        </List>
      )}
    </DeviceSettingsScreen>
  );
}
