import type { ReactNode } from 'react';
import { View } from 'react-native';
import { withRole, type CapabilityRole, type PresentedCapability } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { TargetDial } from '../../../components/target-dial';
import type { ColourRole } from '../../../design/tokens';
import type { Control } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDeviceModel, valueOf } from '../model/device-model';
import type { NumberDescriptor } from './number-kind';

const DIAL_CURRENT: Partial<Readonly<Record<CapabilityRole, CapabilityRole>>> = {
  target_humidity: 'humidity',
  target_temperature: 'temperature',
};

const DIAL_COLOUR: Partial<Readonly<Record<CapabilityRole, ColourRole>>> = {
  target_humidity: 'humidity',
  target_temperature: 'temp-warm',
};

export function isDial(presented: PresentedCapability): boolean {
  return presented.role !== null && DIAL_CURRENT[presented.role] !== undefined;
}

export function dialReading(presented: PresentedCapability): CapabilityRole | null {
  return (presented.role === null ? undefined : DIAL_CURRENT[presented.role]) ?? null;
}

interface DialProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly control: Control;
  readonly descriptor: NumberDescriptor;
  readonly disabled: boolean;
}

export function DialBlock({
  device,
  presented,
  control,
  descriptor,
  disabled,
}: DialProps): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const currentRole = presented.role === null ? undefined : DIAL_CURRENT[presented.role];
  const current = valueOf(
    values,
    currentRole === undefined ? null : withRole(model.presentation, currentRole),
  );
  if (typeof control.value !== 'number')
    return (
      <NumberStepper
        value={null}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        unit={presented.unit ?? ''}
        label={presented.label}
        disabled={disabled}
        onChange={(next) => {
          void control.set(next);
        }}
      />
    );
  const target = control.value;
  return (
    <View className={disabled ? 'items-center opacity-40' : 'items-center'}>
      <TargetDial
        current={typeof current === 'number' ? current : null}
        target={target}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        unit={presented.unit ?? ''}
        label={presented.label}
        size={200}
        colour={(presented.role === null ? undefined : DIAL_COLOUR[presented.role]) ?? 'primary'}
        onCommit={(next) => {
          void control.set(next);
        }}
      />
    </View>
  );
}
