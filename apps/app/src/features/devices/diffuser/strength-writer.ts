import {
  strengthPlan,
  type DiffuserStrengthId,
  type PresentedCapability,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';

export function useStrengthWriter(
  device: Device,
  interval: PresentedCapability,
  duration: PresentedCapability,
): (id: DiffuserStrengthId) => void {
  const intervalControl = useControl(device.id, interval.key);
  const durationControl = useControl(device.id, duration.key);
  return (id) => {
    const [first, second] = strengthPlan(id);
    background(
      (async (): Promise<void> => {
        if (await intervalControl.set(first.value)) {
          await durationControl.set(second.value);
        }
      })(),
      'diffuser.strength_failed',
    );
  };
}
