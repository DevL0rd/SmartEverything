import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { ActionBand } from '../../../components/widget-board/action-band';
import type { Device } from '../../../store/state';
import { VolumeRow } from '../components/volume-row';
import { isHub, offersAction, useComputerCommand } from '../data/computer-device';
import { useComputerSelect } from '../data/computer-metrics';

export type BandControls = 'none' | 'volume' | 'quick' | 'full';

function WakeButton({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  return (
    <Button
      label="Wake"
      icon="power"
      onPress={() => {
        run('wake', null);
      }}
    />
  );
}

function Volume({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="min-w-36 flex-1">
      <VolumeRow device={device} label={device.label} disabled={false} />
    </View>
  );
}

function MuteIcon({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  const muted = useComputerSelect(device.id, (parts) => parts.session?.muted === true);
  if (!offersAction(device, 'mute')) return null;
  return (
    <IconButton
      icon={muted ? 'muted' : 'volume'}
      label={muted ? `Unmute ${device.label}` : `Mute ${device.label}`}
      selected={muted}
      onPress={() => {
        run('mute', !muted);
      }}
    />
  );
}

function LockIcon({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  if (!offersAction(device, 'lock_screen')) return null;
  return (
    <IconButton
      icon="lock"
      label={`Lock ${device.label}`}
      onPress={() => {
        run('lock_screen', null);
      }}
    />
  );
}

function SleepIcon({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  if (!offersAction(device, 'sleep') || isHub(device)) return null;
  return (
    <IconButton
      icon="moon"
      label={`Sleep ${device.label}`}
      onPress={() => {
        run('sleep', null);
      }}
    />
  );
}

function OnlineBand({
  device,
  controls,
}: {
  readonly device: Device;
  readonly controls: BandControls;
}): ReactNode {
  const volume = controls === 'volume' || controls === 'full';
  const quick = controls === 'quick' || controls === 'full';
  return (
    <ActionBand>
      {volume ? <Volume device={device} /> : null}
      {controls === 'quick' ? <MuteIcon device={device} /> : null}
      {quick ? <LockIcon device={device} /> : null}
      {quick ? <SleepIcon device={device} /> : null}
    </ActionBand>
  );
}

export function FaceBand({
  device,
  offline,
  controls,
}: {
  readonly device: Device;
  readonly offline: boolean;
  readonly controls: BandControls;
}): ReactNode {
  if (!offline) return <OnlineBand device={device} controls={controls} />;
  return (
    <ActionBand>{offersAction(device, 'wake') ? <WakeButton device={device} /> : null}</ActionBand>
  );
}

export function WakeNote({
  device,
  offline,
}: {
  readonly device: Device;
  readonly offline: boolean;
}): ReactNode {
  if (!offline || offersAction(device, 'wake')) return null;
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      Can’t be woken from here
    </Text>
  );
}
