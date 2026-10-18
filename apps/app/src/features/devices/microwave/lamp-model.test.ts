import { MICROWAVE_KEYS, type JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { DeviceValues } from '../../../store/state';
import { lampState, lampTarget } from './lamp-model';

const AT = '2026-10-18T07:00:00.000Z';

function observed(entries: Readonly<Record<string, JsonValue>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

const SUPPORTED = { [MICROWAVE_KEYS.supportedLamp]: ['off', 'low', 'high'] };

describe('microwave lamp', () => {
  it('reads the lamp as on for any level but off', () => {
    expect(lampState(observed({ ...SUPPORTED, [MICROWAVE_KEYS.lamp]: 'low' })).on).toBe(true);
    expect(lampState(observed({ ...SUPPORTED, [MICROWAVE_KEYS.lamp]: 'off' })).on).toBe(false);
  });

  it('switches on to the brightest level it lists and off to off', () => {
    const state = lampState(observed({ ...SUPPORTED, [MICROWAVE_KEYS.lamp]: 'off' }));
    expect(lampTarget(state, true)).toBe('high');
    expect(lampTarget(state, false)).toBe('off');
  });

  it('offers no switch when the microwave lists no lit level', () => {
    expect(lampState(observed({ [MICROWAVE_KEYS.lamp]: 'off' })).onLevel).toBeNull();
    expect(
      lampState(observed({ [MICROWAVE_KEYS.supportedLamp]: ['off'], [MICROWAVE_KEYS.lamp]: 'off' }))
        .onLevel,
    ).toBeNull();
  });
});
