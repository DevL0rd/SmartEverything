import { describe, expect, it } from 'vitest';
import { deviceFixture, stateFixture, valuesFixture } from '../../../store/device-fixture';
import type { StoreState } from '../../../store/state';
import { sameReadings } from '../data/use-readings';
import { sourcesIn } from './climate-devices';
import { readingsOf } from './comfort';

const COUNT = 20;
const SENSOR = 3;
const OTHER_SENSOR = 8;

function initial(): StoreState {
  const devices = Array.from({ length: COUNT }, (_, index) => deviceFixture(index));
  return stateFixture(
    devices,
    Object.fromEntries(devices.map((device, index) => [device.id, valuesFixture(index, 0)])),
  );
}

function withTemperature(state: StoreState, index: number, value: number): StoreState {
  return {
    ...state,
    deviceValues: state.deviceValues.set(`dev-${String(index)}`, {
      temperature: { value, observedAt: '2026-10-16T08:00:00.000Z' },
    }),
  };
}

describe('climate sources', () => {
  it('keeps the same list when a device outside it changes', () => {
    const before = initial();
    const first = sourcesIn(before, null);
    const after = {
      ...before,
      deviceValues: before.deviceValues.set('dev-0', { power: { value: true, observedAt: 'x' } }),
    };
    expect(sourcesIn(after, null)).toBe(first);
  });

  it('replaces only the changed device source', () => {
    const before = initial();
    const first = sourcesIn(before, null);
    const second = sourcesIn(withTemperature(before, SENSOR, 30), null);
    expect(second).not.toBe(first);
    const changed = second.filter((source, index) => source !== first[index]);
    expect(changed.map((source) => source.model.device.id)).toEqual([`dev-${String(SENSOR)}`]);
  });
});

describe('comfort readings equality', () => {
  it('ignores a change smaller than the displayed precision', () => {
    const before = initial();
    const nudged = withTemperature(withTemperature(before, SENSOR, 20), OTHER_SENSOR, 20);
    const left = readingsOf(sourcesIn(nudged, null), ['temperature']);
    const right = readingsOf(sourcesIn(withTemperature(nudged, SENSOR, 20.001), null), [
      'temperature',
    ]);
    expect(left[0]?.amount).not.toBe(right[0]?.amount);
    expect(sameReadings(left, right)).toBe(true);
  });

  it('reports a change in the displayed value', () => {
    const base = withTemperature(initial(), SENSOR, 20);
    const left = readingsOf(sourcesIn(base, null), ['temperature']);
    const right = readingsOf(sourcesIn(withTemperature(base, SENSOR, 24), null), ['temperature']);
    expect(sameReadings(left, right)).toBe(false);
  });
});
