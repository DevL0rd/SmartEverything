import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../model/device-model';
import { snapshotOf } from './snapshot';
import { laundryStateOf } from './state';

export function laundryStateLine(values: DeviceValues, model: DeviceModel): string {
  return laundryStateOf(snapshotOf(model.presentation, values, model.device.online)).line;
}
