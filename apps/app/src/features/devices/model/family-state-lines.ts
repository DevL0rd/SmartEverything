import type { DeviceFamily } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from './device-model';
import { laundryStateLine } from '../laundry/state-line';
import { microwaveStateLine } from '../microwave/model';
import { televisionStateLine } from '../television/state-line';

export const FAMILY_STATE_LINES: Readonly<
  Partial<Record<DeviceFamily, (values: DeviceValues, model: DeviceModel) => string>>
> = {
  microwave: microwaveStateLine,
  laundry: laundryStateLine,
  television: televisionStateLine,
};
