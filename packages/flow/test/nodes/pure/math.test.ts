import { describe, expect, it } from 'vitest';
import { bad, good } from './support';

describe('math.add, math.subtract, math.multiply', () => {
  it('add numbers, durations and a moment', () => {
    expect(good('math.add', { a: 50, b: 10 })).toEqual({ result: 60 });
    expect(good('math.add', { a: 1, b: 2, c: 3, d: 4 })).toEqual({ result: 10 });
    expect(good('math.add', { a: '2026-10-18T12:00:00Z', b: 3_600_000 })).toEqual({
      result: '2026-10-18T13:00:00.000Z',
    });
    expect(
      bad('math.add', { a: '2026-10-18T12:00:00Z', b: '2026-10-18T13:00:00Z' }, 'TypeError'),
    ).toContain('only one moment');
    bad('math.add', { a: 1, b: 'x' }, 'TypeError');
    bad('math.add', { a: 1e308, b: 1e308 }, 'MathError');
  });

  it('subtract numbers and moments', () => {
    expect(good('math.subtract', { a: 10, b: 4 })).toEqual({ result: 6 });
    expect(good('math.subtract', { a: '2026-10-18T13:00:00Z', b: '2026-10-18T12:00:00Z' })).toEqual(
      {
        result: 3_600_000,
      },
    );
    expect(good('math.subtract', { a: '2026-10-18T13:00:00Z', b: 3_600_000 })).toEqual({
      result: '2026-10-18T12:00:00.000Z',
    });
    bad('math.subtract', { a: 5, b: '2026-10-18T13:00:00Z' }, 'TypeError');
    bad('math.subtract', { a: 'x', b: 1 }, 'TypeError');
  });

  it('multiply numbers', () => {
    expect(good('math.multiply', { a: 3, b: 4, c: 2 })).toEqual({ result: 24 });
    expect(good('math.multiply', { a: 3, b: 4 })).toEqual({ result: 12 });
    bad('math.multiply', { a: 1e308, b: 10 }, 'MathError');
  });
});

describe('math.divide and math.modulo', () => {
  it('divide and floor-divide', () => {
    expect(good('math.divide', { a: 1500, b: 1000 })).toEqual({ result: 1.5 });
    expect(good('math.divide', { a: 7, b: 2, integer: true })).toEqual({ result: 3 });
    expect(good('math.divide', { a: -7, b: 2, integer: true })).toEqual({ result: -4 });
  });

  it('refuse a zero divisor', () => {
    expect(bad('math.divide', { a: 1, b: 0 }, 'MathError')).toContain('zero');
    bad('math.modulo', { a: 1, b: 0 }, 'MathError');
  });

  it('keep the remainder non-negative for a positive divisor', () => {
    expect(good('math.modulo', { a: 7, b: 5 })).toEqual({ result: 2 });
    expect(good('math.modulo', { a: -1, b: 5 })).toEqual({ result: 4 });
    expect(good('math.modulo', { a: 5, b: 5 })).toEqual({ result: 0 });
  });
});

describe('math.round', () => {
  it('rounds half away from zero', () => {
    expect(good('math.round', { value: 23.46, places: 1 })).toEqual({ result: 23.5 });
    expect(good('math.round', { value: 2.5 })).toEqual({ result: 3 });
    expect(good('math.round', { value: -2.5 })).toEqual({ result: -3 });
    expect(good('math.round', { value: 1.005, places: 2 })).toEqual({ result: 1.01 });
    expect(good('math.round', { value: 1234, places: -2 })).toEqual({ result: 1200 });
    expect(good('math.round', { value: 1e-7, places: 8 })).toEqual({ result: 1e-7 });
    expect(good('math.round', { value: -0.2 })).toEqual({ result: 0 });
  });

  it('floors, ceils and truncates', () => {
    expect(good('math.round', { value: 2.7, mode: 'floor' })).toEqual({ result: 2 });
    expect(good('math.round', { value: 2.1, mode: 'ceil' })).toEqual({ result: 3 });
    expect(good('math.round', { value: -2.7, mode: 'trunc' })).toEqual({ result: -2 });
    expect(good('math.round', { value: -0.2, mode: 'ceil' })).toEqual({ result: 0 });
  });

  it('rounds to a step', () => {
    expect(good('math.round', { value: 23, toStep: 5 })).toEqual({ result: 25 });
    expect(good('math.round', { value: 0.3, toStep: 0.1 })).toEqual({ result: 0.3 });
    expect(good('math.round', { value: 12, toStep: 5, mode: 'floor' })).toEqual({ result: 10 });
    bad('math.round', { value: 1, toStep: 0 }, 'Invalid');
  });

  it('refuses bad places or modes', () => {
    bad('math.round', { value: 1, places: 11 }, 'Invalid');
    bad('math.round', { value: 1, places: 1.5 }, 'Invalid');
    bad('math.round', { value: 1, mode: 'banker' }, 'Invalid');
  });
});

describe('math.min_max', () => {
  it('picks the coldest or warmest', () => {
    expect(good('math.min_max', { values: [21, 19.5, 23], op: 'min' })).toEqual({ result: 19.5 });
    expect(good('math.min_max', { values: [21, 19.5, 23] })).toEqual({ result: 23 });
    bad('math.min_max', { values: [] }, 'Invalid');
    bad('math.min_max', { values: ['a'] }, 'TypeError');
  });
});

describe('math.clamp and math.check_range', () => {
  it('keeps brightness within 1 to 100', () => {
    expect(good('math.clamp', { value: 0, min: 1, max: 100 })).toEqual({
      result: 1,
      clamped: true,
    });
    expect(good('math.clamp', { value: 140, min: 1, max: 100 })).toEqual({
      result: 100,
      clamped: true,
    });
    expect(good('math.clamp', { value: 50, min: 1, max: 100 })).toEqual({
      result: 50,
      clamped: false,
    });
    bad('math.clamp', { value: 5, min: 10, max: 1 }, 'Invalid');
  });

  it('rejects instead of clamping', () => {
    expect(good('math.check_range', { value: 50, min: 1, max: 100 })).toEqual({ result: 50 });
    expect(bad('math.check_range', { value: 0, min: 1, max: 100 }, 'Invalid')).toContain(
      'outside 1 to 100',
    );
    expect(
      bad(
        'math.check_range',
        { value: 0, min: 1, max: 100, message: 'Brightness is 1 to 100' },
        'Invalid',
      ),
    ).toBe('Brightness is 1 to 100');
    bad('math.check_range', { value: 0, min: 5, max: 1 }, 'Invalid');
    expect(
      bad('math.check_range', { value: 3, min: 5, max: 1, message: 'out of bounds' }, 'Invalid'),
    ).toBe('out of bounds');
  });
});

describe('math.map_range', () => {
  it('maps lux to brightness', () => {
    expect(
      good('math.map_range', { value: 250, inMin: 0, inMax: 500, outMin: 100, outMax: 10 }),
    ).toEqual({ result: 55 });
    expect(
      good('math.map_range', { value: 900, inMin: 0, inMax: 500, outMin: 100, outMax: 10 }),
    ).toEqual({ result: 10 });
    expect(
      good('math.map_range', { value: -5, inMin: 0, inMax: 500, outMin: 100, outMax: 10 }),
    ).toEqual({ result: 100 });
  });

  it('wraps or extrapolates when asked', () => {
    expect(
      good('math.map_range', {
        value: 600,
        inMin: 0,
        inMax: 500,
        outMin: 0,
        outMax: 100,
        limit: 'wrap',
      }),
    ).toEqual({ result: 20 });
    expect(
      good('math.map_range', {
        value: -100,
        inMin: 0,
        inMax: 500,
        outMin: 0,
        outMax: 100,
        limit: 'wrap',
      }),
    ).toEqual({ result: 80 });
    expect(
      good('math.map_range', {
        value: 600,
        inMin: 0,
        inMax: 500,
        outMin: 0,
        outMax: 100,
        limit: 'none',
      }),
    ).toEqual({ result: 120 });
  });

  it('refuses an empty input range', () => {
    bad('math.map_range', { value: 1, inMin: 5, inMax: 5, outMin: 0, outMax: 1 }, 'MathError');
  });
});

describe('math.stats', () => {
  it('summarises a list', () => {
    expect(good('math.stats', { values: [2, 4, 4, 4, 5, 5, 7, 9] })).toEqual({
      sum: 40,
      average: 5,
      median: 4.5,
      min: 2,
      max: 9,
      stddev: 2,
      count: 8,
    });
    expect(good('math.stats', { values: [3, 1, 2] })).toMatchObject({ median: 2, average: 2 });
  });

  it('keeps only the count and sum for an empty list', () => {
    expect(good('math.stats', { values: [] })).toEqual({ sum: 0, count: 0 });
  });
});

describe('math.function', () => {
  it('computes the simple functions', () => {
    expect(good('math.function', { value: -3 })).toEqual({ result: 3 });
    expect(good('math.function', { value: -3, op: 'sign' })).toEqual({ result: -1 });
    expect(good('math.function', { value: 3, op: 'negate' })).toEqual({ result: -3 });
    expect(good('math.function', { value: 9, op: 'sqrt' })).toEqual({ result: 3 });
    expect(good('math.function', { value: 2, b: 10, op: 'power' })).toEqual({ result: 1024 });
    expect(good('math.function', { value: 1000, op: 'log10' })).toEqual({ result: 3 });
    expect(good('math.function', { value: 1, op: 'ln' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 0, op: 'exp' })).toEqual({ result: 1 });
    expect(good('math.function', { value: 0, op: 'sin' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 0, op: 'cos' })).toEqual({ result: 1 });
    expect(good('math.function', { value: 0, op: 'tan' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 0, op: 'asin' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 1, op: 'acos' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 0, op: 'atan' })).toEqual({ result: 0 });
    expect(good('math.function', { value: 0, b: 1, op: 'atan2' })).toEqual({ result: 0 });
    expect(good('math.function', { value: Math.PI, op: 'degrees' })).toEqual({ result: 180 });
    expect(good('math.function', { value: 180, op: 'radians' })).toEqual({ result: Math.PI });
  });

  it('raises MathError outside the domain', () => {
    expect(bad('math.function', { value: -1, op: 'sqrt' }, 'MathError')).toContain('square root');
    bad('math.function', { value: 0, op: 'ln' }, 'MathError');
    bad('math.function', { value: 0, op: 'log10' }, 'MathError');
    bad('math.function', { value: 2, op: 'asin' }, 'MathError');
    bad('math.function', { value: -2, op: 'acos' }, 'MathError');
    bad('math.function', { value: 0, b: -1, op: 'power' }, 'MathError');
    bad('math.function', { value: 1000, op: 'exp' }, 'MathError');
  });

  it('needs a second number for power and atan2 and a known op', () => {
    bad('math.function', { value: 2, op: 'power' }, 'Invalid');
    bad('math.function', { value: 2, op: 'cbrt' }, 'Invalid');
  });
});
