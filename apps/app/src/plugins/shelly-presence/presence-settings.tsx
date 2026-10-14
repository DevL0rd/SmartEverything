import type { ReactNode } from 'react';
import { SHELLY_PRESENCE_PAGES } from '@smarteverything/domain';
import { List } from '../../components/section';
import { NavRow } from '../../components/rows';
import { href } from '../../app-shell/hrefs';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { PRESENCE_PAGE_ICONS } from './presence-pages';
import { usePresence } from './presence-data';

export function PresenceSettings({ device }: { readonly device: Device }): ReactNode {
  const devices = useDevices({ includeHidden: true });
  const stream = usePresence(device);
  if (device.parent_id !== null) {
    const parent = devices.find((item) => item.id === device.parent_id);
    const zone =
      stream.state === 'ready'
        ? stream.value.zones.find((item) => item.externalId === device.external_id)
        : undefined;
    if (parent === undefined || zone === undefined) return null;
    return (
      <List title="Shelly zone">
        <NavRow
          title="Room and zone settings"
          icon="grid"
          href={{
            pathname: '/device/[deviceId]/settings/[page]',
            params: { deviceId: parent.id, page: 'presence-room', zone: String(zone.config.id) },
          }}
        />
      </List>
    );
  }
  return (
    <List title="Shelly Presence">
      {SHELLY_PRESENCE_PAGES.map((page) => (
        <NavRow
          key={page.id}
          title={page.title}
          icon={PRESENCE_PAGE_ICONS[page.id] ?? 'settings'}
          href={href.settings.device(device.id, page.id)}
        />
      ))}
    </List>
  );
}
