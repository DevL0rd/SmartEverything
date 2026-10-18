import {
  SET_CONTROL,
  type DeviceCapability,
  type SetControl,
  type TargetV2,
} from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { targetControls } from '../model/blanks';
import { writableCapabilities, type DeviceLike } from '../model/capability-choices';
import { capabilityLabel } from '../model/present';

export interface ControlChoice {
  readonly reference: SetControl;
  readonly label: string;
  readonly capability: DeviceCapability;
  readonly device: DeviceLike;
  readonly percent: boolean;
}

export function controlChoices(catalog: Catalog, target: TargetV2): readonly ControlChoice[] {
  if ('device' in target) {
    const device = catalog.allDevices.find((entry) => entry.id === target.device);
    return device === undefined
      ? []
      : writableCapabilities(device).map((capability) => ({
          reference: capability.key,
          label: capabilityLabel(device, capability),
          capability,
          device,
          percent: false,
        }));
  }
  return targetControls(catalog, target).flatMap((choice) => {
    const reference = SET_CONTROL.safeParse(choice.reference);
    return reference.success
      ? [
          {
            reference: reference.data,
            label: choice.presented.label,
            capability: choice.presented.capability,
            device: choice.device,
            percent: choice.presented.role === 'brightness',
          },
        ]
      : [];
  });
}
