import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { usePowerAction } from '../controls/power-toggle';

function OfflinePower({
  device,
  icon,
}: {
  readonly device: Device;
  readonly icon: IconName;
}): ReactNode {
  return (
    <View
      role="img"
      aria-label={`${device.label} is offline`}
      className="size-touch-min items-center justify-center"
    >
      <View className="size-9 items-center justify-center rounded-full border-2 border-dashed border-on-surface-variant opacity-60">
        <Icon name={icon} size={20} tone="variant" />
      </View>
    </View>
  );
}

export function RowPower({
  device,
  icon,
  offline,
  ring,
}: {
  readonly device: Device;
  readonly icon: IconName;
  readonly offline: boolean;
  readonly ring: string | null;
}): ReactNode {
  const power = usePowerAction(device);
  const on = power.state === 'on';
  const edge: ViewStyle | undefined = on && ring !== null ? { borderColor: ring } : undefined;
  if (offline) {
    return <OfflinePower device={device} icon={icon} />;
  }
  if (power.state !== 'on' && power.state !== 'off') {
    return null;
  }
  return (
    <Interactive
      role="switch"
      checked={on}
      label={power.label}
      onPress={power.toggle}
      className="size-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-9 items-center justify-center rounded-full border-2',
          on ? 'border-primary bg-primary-container' : 'border-dashed border-on-surface-variant',
        )}
        style={edge}
      >
        <Icon name={icon} size={20} tone={on ? 'primary' : 'variant'} />
      </View>
    </Interactive>
  );
}
