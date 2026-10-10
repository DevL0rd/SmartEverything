import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import {
  curatedControls,
  type CapabilityRole,
  type PresentedCapability,
} from '@smarteverything/domain';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDisplayName } from '../model/display-name';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { modeContextOf, shownInMode } from '../model/mode-rules';
import { ControlBlock } from './control-block';
import { offlineReason, poweredOffReason } from './guard';
import { HoldButtons } from './hold-buttons';

export function usePrimaryControls(
  device: Device,
  exclude: ReadonlySet<CapabilityRole>,
): readonly PresentedCapability[] {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const curated = useMemo(() => curatedControls(device), [device]);
  const context = modeContextOf(model, values);
  return curated.filter(
    (presented) =>
      (presented.role === null || !exclude.has(presented.role)) && shownInMode(presented, context),
  );
}

function useReason(device: Device): string | null {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const name = useDisplayName(device.id);
  const power = powerStateOf(model, values);
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
  const reason = useReason(device);
  const left = controls.find((presented) => presented.role === 'rotate_left');
  const right = controls.find((presented) => presented.role === 'rotate_right');
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
