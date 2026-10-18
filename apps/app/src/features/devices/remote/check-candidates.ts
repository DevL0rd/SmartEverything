import { withRole } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';

export interface CheckCandidate {
  readonly id: string;
  readonly label: string;
}

export function checkCandidatesOf(state: StoreState): readonly CheckCandidate[] {
  return rowsOf(state.tables.devices)
    .filter((device) => withRole(deviceModelOf(device).presentation, 'power_draw') !== undefined)
    .map((device) => ({ id: device.id, label: device.label }));
}
