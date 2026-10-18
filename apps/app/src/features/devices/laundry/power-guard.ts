import { confirm } from '../../../components/confirm-store';
import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../model/device-model';
import { snapshotOf } from './snapshot';
import { laundryStateOf } from './state';

export async function confirmPowerOff(
  model: DeviceModel,
  values: DeviceValues,
  online: boolean,
): Promise<boolean> {
  if (model.family !== 'laundry') {
    return true;
  }
  const state = laundryStateOf(snapshotOf(model.presentation, values, online));
  if (!state.running && state.key !== 'paused') {
    return true;
  }
  return confirm({
    title: 'Turn off mid-cycle?',
    body: 'The wash stops where it is and the clothes stay in the drum.',
    confirmLabel: 'Turn off',
    tone: 'destructive',
  });
}
