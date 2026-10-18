import type { ReactNode } from 'react';
import { SHELLY_PAGES, type ShellyPage } from '@smarteverything/shelly';
import { EmptyState } from '../../components/empty-state';
import { DeviceSettingsFrame } from '../../features/devices/device-settings/settings-frame';
import type { Device } from '../../store/state';
import { CataloguePage } from './catalogue-page';
import { usePresence } from './presence-data';
import { RoomSettings } from './room-settings';

export function PresencePage({
  device,
  page,
}: {
  readonly device: Device;
  readonly page: ShellyPage;
}): ReactNode {
  const stream = usePresence(device);
  const title = SHELLY_PAGES.find((item) => item.id === page)?.title ?? 'Shelly Presence';
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title={title}>
      {stream.state !== 'ready' ? (
        <EmptyState
          icon="motion"
          title="Sensor configuration unavailable"
          body={stream.state === 'invalid' ? stream.reason : 'Waiting for the connected sensor.'}
        />
      ) : page === 'presence-room' ? (
        <RoomSettings sensor={stream.value} />
      ) : (
        <CataloguePage sensor={stream.value} page={page} />
      )}
    </DeviceSettingsFrame>
  );
}
