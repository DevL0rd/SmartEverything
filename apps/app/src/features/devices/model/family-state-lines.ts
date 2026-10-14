import type { DeviceFamily } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { microwaveStateLine } from '../microwave/model';
export const FAMILY_STATE_LINES: Readonly<
  Partial<Record<DeviceFamily, (values: DeviceValues) => string>>
> = { microwave: microwaveStateLine };
