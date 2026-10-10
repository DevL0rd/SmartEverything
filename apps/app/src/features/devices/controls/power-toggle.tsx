import type { ReactNode } from 'react';
import { IconButton } from '../../../components/icon-button';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDisplayName } from '../model/display-name';
import { powerStateOf, useDeviceModel } from '../model/device-model';

export function usePowerAction(device: Device): {
  readonly state: ReturnType<typeof powerStateOf>;
  readonly label: string;
  readonly toggle: () => void;
} {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const control = useControl(device.id, 'power');
  const name = useDisplayName(device.id);
  const state = powerStateOf(model, values);
  const on = control.value === true;
  return {
    state: state === 'on' || state === 'off' ? (on ? 'on' : 'off') : state,
    label: on ? `Turn off ${name}` : `Turn on ${name}`,
    toggle: (): void => {
      void control.set(!on);
    },
  };
}

export function PowerToggle({ device }: { readonly device: Device }): ReactNode {
  const power = usePowerAction(device);
  if (power.state !== 'on' && power.state !== 'off') {
    return null;
  }
  return (
    <IconButton
      icon="power"
      label={power.label}
      variant={power.state === 'on' ? 'filled' : 'tonal'}
      onPress={power.toggle}
    />
  );
}
