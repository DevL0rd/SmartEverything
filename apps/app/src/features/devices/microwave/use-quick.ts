import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { microwaveConfiguration } from './model';
import { quickState, type QuickChoice, type QuickState } from './quick-model';
import { useCycles } from './use-cycles';
import { useProgramSender } from './use-program-sender';

export interface MicrowaveQuick {
  readonly state: QuickState;
  readonly busy: boolean;
  readonly send: (choice: QuickChoice) => Promise<void>;
}

export function useQuickState(device: Device, live: boolean): QuickState {
  const last = useCycles(device.id, live)[0];
  return useDeviceDerived(
    device.id,
    (values) => quickState(microwaveConfiguration(device, values), values, last),
    [device, last],
  );
}

export function useQuick(device: Device, live: boolean): MicrowaveQuick {
  const sender = useProgramSender(device, true);
  const state = useQuickState(device, live);
  return {
    state,
    busy: sender.sending,
    send: (choice) =>
      sender.send({
        program: choice.program,
        mode: choice.mode,
        unit: choice.unit,
        applied: choice.applied,
        start: choice.start,
      }),
  };
}
