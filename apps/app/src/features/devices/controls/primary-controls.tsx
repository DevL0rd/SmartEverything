import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityRole, PresentedCapability } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import { shallowEqual } from '../../../store/store-context';
import type { Device, DeviceValues } from '../../../store/state';
import { useDisplayName } from '../model/display-name';
import { powerStateOf, useDeviceModel, type DeviceModel } from '../model/device-model';
import { modeContextOf, shownInMode } from '../model/mode-rules';
import { ControlBlock } from './control-block';
import { offlineReason, poweredOffReason } from './guard';
import { FAMILY_CONTROLS } from './family-controls';
import { HoldButtons } from './hold-buttons';

export function primaryControlsOf(
  model: DeviceModel,
  values: DeviceValues,
  exclude: ReadonlySet<CapabilityRole>,
): readonly PresentedCapability[] {
  const context = modeContextOf(model, values);
  return model.curated.filter(
    (presented) =>
      (presented.role === null || !exclude.has(presented.role)) && shownInMode(presented, context),
  );
}

export function usePrimaryControls(
  device: Device,
  exclude: ReadonlySet<CapabilityRole>,
): readonly PresentedCapability[] {
  const model = useDeviceModel(device);
  return useDeviceDerived(
    device.id,
    (values) => primaryControlsOf(model, values, exclude),
    [model, exclude],
    shallowEqual,
  );
}

function useReason(device: Device): string | null {
  const model = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const power = useDeviceDerived(device.id, (values) => powerStateOf(model, values), [model]);
  if (!device.online) {
    return offlineReason(name);
  }
  return power === 'off' ? poweredOffReason(name) : null;
}

const NO_EXCLUSIONS: ReadonlySet<CapabilityRole> = new Set();

export function PrimaryControls({
  device,
  exclude = NO_EXCLUSIONS,
}: {
  readonly device: Device;
  readonly exclude?: ReadonlySet<CapabilityRole>;
}): ReactNode {
  const controls = usePrimaryControls(device, exclude);
  const Custom = FAMILY_CONTROLS[useDeviceModel(device).family]?.primary;
  const reason = useReason(device);
  const left = controls.find((presented) => presented.role === 'rotate_left');
  const right = controls.find((presented) => presented.role === 'rotate_right');
  if (Custom !== undefined) {
    return <Custom device={device} />;
  }
  if (controls.length === 0) {
    return null;
  }
  return (
    <View className="gap-5">
      {controls.map((presented) => {
        if (presented.role === 'rotate_right' && left !== undefined) {
          return null;
        }
        if (presented.role === 'rotate_left' && right !== undefined) {
          return (
            <HoldButtons
              key="turn"
              device={device}
              left={presented}
              right={right}
              reason={reason}
            />
          );
        }
        return (
          <ControlBlock key={presented.key} device={device} presented={presented} reason={reason} />
        );
      })}
    </View>
  );
}
