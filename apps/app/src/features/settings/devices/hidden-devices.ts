import { baseNameOf, type NamedDevice } from '@smarteverything/domain';
import { naturalCompare } from '../../../format/text';

export interface HiddenDevice<Device> {
  readonly device: Device;
  readonly name: string;
}

export function hiddenDevices<Device extends NamedDevice & { readonly hidden: boolean }>(
  devices: readonly Device[],
): readonly HiddenDevice<Device>[] {
  return devices
    .filter((device) => device.hidden)
    .map((device) => ({ device, name: baseNameOf(device) }))
    .sort((left, right) => naturalCompare(left.name, right.name));
}
