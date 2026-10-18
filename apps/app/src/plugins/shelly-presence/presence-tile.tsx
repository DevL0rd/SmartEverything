import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { StatusChip } from '../../components/status-chip';
import { Text } from '../../components/text';
import { useRoomName } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePresence } from './presence-data';
import { shownZone, zoneState } from './presence-model';
import { PresencePuck } from './presence-puck';
import { lightWord, zoneLine } from './room-map-legend';

interface Face {
  readonly device: Device;
  readonly sensor: ShellyDevice | null;
  readonly online: boolean;
  readonly zone: ShellyZone | null;
  readonly showRoom: boolean;
}

function Puck({ face, size }: { readonly face: Face; readonly size: number }): ReactNode {
  const { sensor, zone } = face;
  return (
    <PresencePuck
      size={size}
      occupied={sensor !== null && zoneState(sensor, zone) === 'Occupied'}
      count={zone?.status?.num_objects ?? 0}
      light={sensor?.light[0]?.status?.illumination ?? null}
      offline={!face.online}
    />
  );
}

function Names({ face, lines }: { readonly face: Face; readonly lines: number }): ReactNode {
  const { device, sensor, zone, showRoom } = face;
  const room = useRoomName(device.id);
  const state = sensor === null ? 'Unknown' : zoneLine(sensor, zone);
  return (
    <View className="min-w-0 gap-0.5">
      <Text variant="body-strong" numberOfLines={lines}>
        {device.label}
      </Text>
      {showRoom && room !== null ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {room}
        </Text>
      ) : null}
      <Text
        variant="footnote"
        tone={state.startsWith('Occupied') ? 'primary' : 'variant'}
        numberOfLines={1}
      >
        {state}
      </Text>
    </View>
  );
}

function OfflineChip({ online }: { readonly online: boolean }): ReactNode {
  return online ? null : <StatusChip status="offline" />;
}

function SmallFace({ face }: { readonly face: Face }): ReactNode {
  const { sensor } = face;
  return (
    <View className="flex-1 justify-between gap-2" pointerEvents="none">
      <View className="flex-row items-start justify-between gap-2">
        <Puck face={face} size={48} />
        <OfflineChip online={face.online} />
      </View>
      <View className="gap-0.5">
        <Names face={face} lines={2} />
        {sensor === null ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {lightWord(sensor)}
          </Text>
        )}
      </View>
    </View>
  );
}

export function PresenceTile({
  device,
  showRoom,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
}): ReactNode {
  const stream = usePresence(device);
  const sensor = stream.state === 'ready' ? stream.value : null;
  const face: Face = {
    device,
    sensor,
    online: sensor === null ? device.online : sensor.connection.state === 'online',
    zone: sensor === null ? null : shownZone(sensor, device),
    showRoom,
  };
  return <SmallFace face={face} />;
}
