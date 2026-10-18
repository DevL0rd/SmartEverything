import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { VolumeRow } from '../components/volume-row';
import { isHub, offersAction, useComputerCommand } from '../data/computer-device';
import { useComputerSelect } from '../data/computer-metrics';

export function FaceControls({
  device,
  offline,
}: {
  readonly device: Device;
  readonly offline: boolean;
}): ReactNode {
  const run = useComputerCommand(device);
  if (!offline) return <VolumeRow device={device} label={device.label} disabled={false} />;
  if (!offersAction(device, 'wake')) {
    return (
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        Can’t be woken from here
      </Text>
    );
  }
  return (
    <View className="flex-row items-center">
      <Button
        label="Wake"
        icon="power"
        onPress={() => {
          run('wake', null);
        }}
      />
    </View>
  );
}

export function WakeIconButton({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  return (
    <IconButton
      icon="power"
      label={`Wake ${device.label}`}
      variant="tonal"
      onPress={() => {
        run('wake', null);
      }}
    />
  );
}

export function QuickIcons({
  device,
  mute,
}: {
  readonly device: Device;
  readonly mute: boolean;
}): ReactNode {
  const run = useComputerCommand(device);
  const muted = useComputerSelect(device.id, (parts) => parts.session?.muted === true);
  return (
    <View className="flex-row items-center">
      {mute && offersAction(device, 'mute') ? (
        <IconButton
          icon={muted ? 'muted' : 'volume'}
          label={muted ? `Unmute ${device.label}` : `Mute ${device.label}`}
          selected={muted}
          onPress={() => {
            run('mute', !muted);
          }}
        />
      ) : null}
      {offersAction(device, 'lock_screen') ? (
        <IconButton
          icon="lock"
          label={`Lock ${device.label}`}
          onPress={() => {
            run('lock_screen', null);
          }}
        />
      ) : null}
      {offersAction(device, 'sleep') && !isHub(device) ? (
        <IconButton
          icon="moon"
          label={`Sleep ${device.label}`}
          onPress={() => {
            run('sleep', null);
          }}
        />
      ) : null}
    </View>
  );
}
