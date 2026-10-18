import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  DIFFUSER_STRENGTH_LABELS,
  DIFFUSER_STRENGTH_IDS,
  withRole,
  type DiffuserStrength,
  type PresentedCapability,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { ControlBlock } from '../controls/control-block';
import { useDeviceModel } from '../model/device-model';
import { useStrengthWriter } from './strength-writer';
import type { DiffuserRead } from './diffuser-read';
import { useDiffuserRead, useDiffuserReadOf } from './use-diffuser';

const OPTIONS: readonly { readonly value: DiffuserStrength; readonly label: string }[] = [
  ...DIFFUSER_STRENGTH_IDS,
  'custom' as const,
].map((value) => ({ value, label: DIFFUSER_STRENGTH_LABELS[value] }));

function StrengthBlock({
  device,
  interval,
  duration,
}: {
  readonly device: Device;
  readonly interval: PresentedCapability;
  readonly duration: PresentedCapability;
}): ReactNode {
  const read = useDiffuserRead(device);
  const [custom, setCustom] = useState(false);
  const write = useStrengthWriter(device, interval, duration);
  const choice: DiffuserStrength = custom ? 'custom' : (read.strength ?? 'custom');
  const reason = device.online ? null : 'Offline';
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text variant="callout" tone="variant">
          Strength
        </Text>
        <Segmented
          label="Strength"
          options={OPTIONS}
          value={choice}
          disabled={!device.online}
          onChange={(next) => {
            setCustom(next === 'custom');
            if (next !== 'custom') {
              write(next);
            }
          }}
        />
      </View>
      {choice === 'custom' ? (
        <View className="gap-3">
          <ControlBlock device={device} presented={interval} reason={reason} />
          <ControlBlock device={device} presented={duration} reason={reason} />
        </View>
      ) : null}
    </View>
  );
}

export function StrengthControl({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const interval = withRole(model.presentation, 'spray_interval');
  const duration = withRole(model.presentation, 'spray_duration');
  if (interval === undefined || duration === undefined) {
    return null;
  }
  return <StrengthBlock device={device} interval={interval} duration={duration} />;
}

function StrengthMenu({
  device,
  read,
  interval,
  duration,
}: {
  readonly device: Device;
  readonly read: DiffuserRead;
  readonly interval: PresentedCapability;
  readonly duration: PresentedCapability;
}): ReactNode {
  const write = useStrengthWriter(device, interval, duration);
  const items: readonly MenuItem[] = DIFFUSER_STRENGTH_IDS.map((id) => ({
    label: DIFFUSER_STRENGTH_LABELS[id],
    icon: 'droplet',
    onPress: (): void => {
      write(id);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Strength');
  const word = read.strength === null ? 'Strength' : DIFFUSER_STRENGTH_LABELS[read.strength];
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label={`Strength: ${word}`}
        variant="tonal"
        icon="droplet"
        disabled={!device.online}
        onPress={open}
      />
      {menu}
    </View>
  );
}

export function StrengthMenuButton({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const read = useDiffuserReadOf(device, model);
  const interval = withRole(model.presentation, 'spray_interval');
  const duration = withRole(model.presentation, 'spray_duration');
  if (interval === undefined || duration === undefined) {
    return null;
  }
  return <StrengthMenu device={device} read={read} interval={interval} duration={duration} />;
}
