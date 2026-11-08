import {
  strengthPlan,
  type DiffuserStrengthId,
  type PresentedCapability,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useLedger } from '../../../store/store-context';
import type { Device } from '../../../store/state';

export function useStrengthWriter(
  device: Device,
  interval: PresentedCapability,
  duration: PresentedCapability,
): (id: DiffuserStrengthId) => void {
  const ledger = useLedger();
  return (id) => {
    const [first, second] = strengthPlan(id);
    background(
      (async (): Promise<void> => {
        if ((await ledger.send(device, interval.key, first.value)).sent) {
          await ledger.send(device, duration.key, second.value);
        }
      })(),
      'diffuser.strength_failed',
    );
  };
}
