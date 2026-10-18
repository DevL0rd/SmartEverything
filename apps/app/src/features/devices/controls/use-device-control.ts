import { isLiveControl, type PresentedCapability } from '@smarteverything/domain';
import { useControl, type Control } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import type { Device } from '../../../store/state';

export function useDeviceControl(device: Device, presented: PresentedCapability): Control {
  const raw = useControl(device.id, presented.key);
  return useLiveControl(device, presented.key, raw, isLiveControl(presented));
}

export function liveChange(
  presented: PresentedCapability,
  set: (value: number) => void,
): { readonly onChange?: (value: number) => void } {
  return isLiveControl(presented) ? { onChange: set } : {};
}
