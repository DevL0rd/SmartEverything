import type { ComputerMetric } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';

export interface Headline {
  readonly value: number;
  readonly at: string;
}

export function headlineOf(values: DeviceValues, metric: ComputerMetric): Headline | null {
  const reported = values[metric];
  return typeof reported?.value === 'number'
    ? { value: reported.value, at: reported.observedAt }
    : null;
}

export function sameHeadline(left: Headline | null, right: Headline | null): boolean {
  return left?.value === right?.value && left?.at === right?.at;
}
