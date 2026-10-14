import { MICROWAVE_KEYS, type DeviceFamily } from '@smarteverything/domain';
import type { VisualState } from '../types';
import type { ObservedValues } from './lookup';
function microwaveState(base: VisualState, values: ObservedValues): VisualState {
  const state = values[MICROWAVE_KEYS.state]?.value;
  const progress = values[MICROWAVE_KEYS.progress]?.value;
  return {
    ...base,
    power: state === 'running' ? 'on' : 'off',
    source: typeof state === 'string' ? state : null,
    progress: typeof progress === 'number' ? progress / 100 : null,
  };
}
const FAMILY_STATES: Readonly<
  Partial<Record<DeviceFamily, (base: VisualState, values: ObservedValues) => VisualState>>
> = { microwave: microwaveState };
export function familyVisualState(
  family: DeviceFamily,
  base: VisualState,
  values: ObservedValues,
): VisualState {
  const decorate = FAMILY_STATES[family];
  return decorate === undefined ? base : decorate(base, values);
}
