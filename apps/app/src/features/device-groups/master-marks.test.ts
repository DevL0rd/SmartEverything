import { describe, expect, it } from 'vitest';
import type { Spread } from '@smarteverything/domain';
import { mixedOf } from './master-marks';

function spread(values: readonly number[]): Spread {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    perMember: values.map((value, index) => ({ deviceId: `d${String(index)}`, value })),
  };
}

describe('mixedOf', () => {
  it('has no band without a spread', () => {
    expect(mixedOf(null, {}, '#fff')).toBeUndefined();
  });

  it('has no band when every lit light shares one level', () => {
    expect(mixedOf(spread([60, 60, 60]), {}, '#fff')).toBeUndefined();
  });

  it('draws min to max with a tick per member in its own colour', () => {
    expect(mixedOf(spread([20, 80]), { d0: '#f00' }, '#fff')).toEqual({
      min: 20,
      max: 80,
      ticks: [
        { value: 20, colour: '#f00' },
        { value: 80, colour: '#fff' },
      ],
    });
  });
});
