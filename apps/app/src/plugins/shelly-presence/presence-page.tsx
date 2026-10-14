import type { ReactNode } from 'react';
import type { ShellyPresencePage } from '@smarteverything/domain';
import { SHELLY_PRESENCE_PAGES } from '@smarteverything/domain';
import { EmptyState } from '../../components/empty-state';
import { DeviceSettingsFrame } from '../../features/devices/device-settings/settings-frame';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { RoomSettings } from './room-settings';
import { PresenceNativeSettings } from './native-settings';

export function PresencePage({
  device,
  page,
}: {
  readonly device: Device;
  readonly page: ShellyPresencePage;
}): ReactNode {
  const stream = usePresence(device);
  const title = SHELLY_PRESENCE_PAGES.find((item) => item.id === page)?.title ?? 'Shelly Presence';
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
        <PresenceNativeSettings sensor={stream.value} page={page} />
      )}
    </DeviceSettingsFrame>
  );
}
