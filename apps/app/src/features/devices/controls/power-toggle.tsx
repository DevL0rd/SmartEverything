import type { ReactNode } from 'react';
import { IconButton } from '../../../components/icon-button';
import { readControl, sameControl, useControlOf, type ControlState } from '../../../store/control';
import { deviceValuesOf, type Device } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { displayNameOf } from '../model/display-name';
import { powerStateOf, useDeviceModel, type PowerState } from '../model/device-model';
import { background } from '@smarteverything/logging';
import { confirmPowerOff } from '../laundry/power-guard';

interface PowerRead {
  readonly control: ControlState;
  readonly name: string;
  readonly state: PowerState;
}

function samePower(left: PowerRead, right: PowerRead): boolean {
  return (
    left.name === right.name &&
    left.state === right.state &&
    sameControl(left.control, right.control)
  );
}

export function usePowerAction(device: Device): {
  readonly state: PowerState;
  readonly label: string;
  readonly toggle: () => void;
  readonly set: (next: boolean) => void;
} {
  const model = useDeviceModel(device);
  const read = useStoreSelector(
    (state): PowerRead => ({
      control: readControl(state, device.id, 'power'),
      name: displayNameOf(state, device.id),
      state: powerStateOf(model, deviceValuesOf(state, device.id)),
    }),
    samePower,
    [device.id, model],
  );
  const control = useControlOf(device.id, 'power', read.control);
  const store = useEntityStore();
  const apply = async (next: boolean): Promise<void> => {
    if (
      !next &&
      !(await confirmPowerOff(model, deviceValuesOf(store.get(), device.id), device.online))
    ) {
      return;
    }
    await control.set(next);
  };
  const { name, state } = read;
  const on = control.value === true;
  return {
    state: state === 'on' || state === 'off' ? (on ? 'on' : 'off') : state,
    label: on ? `Turn off ${name}` : `Turn on ${name}`,
    toggle: (): void => {
      background(apply(!on), 'control.set_failed');
    },
    set: (next): void => {
      background(apply(next), 'control.set_failed');
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
