import { describe, expect, it } from 'vitest';
import { sameConsumers, topConsumers, type Consumer } from './consumers';

function consumer(deviceId: string, value: number): Consumer {
  return { deviceId, name: deviceId, value, unit: 'W' };
}

describe('topConsumers', () => {
  it('keeps the three biggest draws, biggest first', () => {
    const shown = topConsumers([
      consumer('desk', 42),
      consumer('heater', 1200),
      consumer('dishwasher', 400),
      consumer('lamp', 8),
    ]);
    expect(shown.map((entry) => entry.deviceId)).toEqual(['heater', 'dishwasher', 'desk']);
  });

  it('drops readings that are not numbers', () => {
    expect(
      topConsumers([consumer('a', Number.NaN), consumer('b', 5)]).map((c) => c.deviceId),
    ).toEqual(['b']);
  });

  it('returns every consumer when fewer than the limit exist', () => {
    expect(topConsumers([consumer('a', 1)])).toHaveLength(1);
  });
});

describe('sameConsumers', () => {
  it('is equal for the same draws and different when a value moves', () => {
    expect(sameConsumers([consumer('a', 1)], [consumer('a', 1)])).toBe(true);
    expect(sameConsumers([consumer('a', 1)], [consumer('a', 2)])).toBe(false);
  });
});
