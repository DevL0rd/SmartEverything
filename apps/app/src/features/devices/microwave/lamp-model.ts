import { z } from 'zod';
import { MICROWAVE_KEYS } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';

const OFF = 'off';

export interface LampState {
  readonly on: boolean;
  readonly onLevel: string | null;
}

export function lampState(values: DeviceValues): LampState {
  const supported = z.array(z.string()).safeParse(values[MICROWAVE_KEYS.supportedLamp]?.value);
  const lit = supported.success ? supported.data.filter((level) => level !== OFF) : [];
  const current = values[MICROWAVE_KEYS.lamp]?.value;
  return {
    on: typeof current === 'string' && current !== OFF,
    onLevel: lit[lit.length - 1] ?? null,
  };
}

export function lampTarget(state: LampState, turnOn: boolean): string | null {
  return turnOn ? state.onLevel : OFF;
}
