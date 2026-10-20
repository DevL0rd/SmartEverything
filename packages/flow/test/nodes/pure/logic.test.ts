import { describe, expect, it } from 'vitest';
import { HOME, NOW, bad, good, runPorts } from './support';

describe('logic.compare', () => {
  it('compares numbers in every direction', () => {
    expect(good('logic.compare', { a: 28, b: 26, op: 'gt' })).toEqual({ result: true });
    expect(good('logic.compare', { a: 26, b: 26, op: 'gt' })).toEqual({ result: false });
    expect(good('logic.compare', { a: 26, b: 26, op: 'gte' })).toEqual({ result: true });
    expect(good('logic.compare', { a: 25, b: 26, op: 'lt' })).toEqual({ result: true });
    expect(good('logic.compare', { a: 26, b: 26, op: 'lte' })).toEqual({ result: true });
    expect(good('logic.compare', { a: 26, b: 26 })).toEqual({ result: true });
    expect(good('logic.compare', { a: 26, b: 27, op: 'ne' })).toEqual({ result: true });
  });

  it('treats an absent left value as false for every test', () => {
    expect(good('logic.compare', { b: 26, op: 'ne' })).toEqual({ result: false });
    expect(good('logic.compare', { b: 26, op: 'gt' })).toEqual({ result: false });
  });

  it('fails on an absent left value when strict', () => {
    expect(bad('logic.compare', { b: 26, strict: true }, 'NotFound')).toContain('absent');
  });

  it('needs a right value and refuses mixed kinds', () => {
    bad('logic.compare', { a: 1 }, 'Invalid');
    expect(bad('logic.compare', { a: 1, b: 'x' }, 'TypeError')).toContain('not the same kind');
    bad('logic.compare', { a: true, b: false, op: 'gt' }, 'TypeError');
    bad('logic.compare', { a: 1, b: 2, op: 'nope' }, 'Invalid');
  });

  it('ignores case and uses a tolerance when asked', () => {
    expect(good('logic.compare', { a: 'Rain', b: 'rain', ignoreCase: true })).toEqual({
      result: true,
    });
    expect(good('logic.compare', { a: 'Rain', b: 'rain' })).toEqual({ result: false });
    expect(good('logic.compare', { a: 20.04, b: 20, tolerance: 0.1 })).toEqual({ result: true });
    expect(good('logic.compare', { a: 20.04, b: 20, tolerance: 0.1, op: 'gt' })).toEqual({
      result: false,
    });
  });

  it('compares text, moments and lists', () => {
    expect(good('logic.compare', { a: 'b', b: 'a', op: 'gt' })).toEqual({ result: true });
    expect(
      good('logic.compare', {
        a: '2026-10-18T12:00:00Z',
        b: '2026-10-18T19:00:00+07:00',
      }),
    ).toEqual({ result: true });
    expect(
      good('logic.compare', {
        a: '2026-10-18T13:00:00Z',
        b: '2026-10-18T19:00:00+07:00',
        op: 'gt',
      }),
    ).toEqual({ result: true });
    expect(good('logic.compare', { a: [1, { x: 1, y: 2 }], b: [1, { y: 2, x: 1 }] })).toEqual({
      result: true,
    });
    expect(good('logic.compare', { a: null, b: null })).toEqual({ result: true });
  });
});

describe('missing, null and other kinds fail clearly', () => {
  const hint = 'use Has a value or First available to handle a missing value';

  it('names the absent left value of a strict compare and how to handle it', () => {
    expect(bad('logic.compare', { b: 'dark', op: 'ne', strict: true }, 'NotFound')).toBe(
      `the left value of the comparison is absent; ${hint}`,
    );
  });

  it('names a null side of a compare against a value', () => {
    expect(bad('logic.compare', { a: null, b: 'dark' }, 'TypeError')).toBe(
      `the left value of the comparison is null and cannot be compared with "dark"; ${hint}`,
    );
    expect(bad('logic.compare', { a: 26, b: null, op: 'gt' }, 'TypeError')).toBe(
      `the right value of the comparison is null and cannot be compared with 26; ${hint}`,
    );
  });

  it('fails every test on another kind', () => {
    for (const op of ['eq', 'ne', 'gt', 'gte', 'lt', 'lte']) {
      for (const a of ['dark', true, [26]]) {
        expect(bad('logic.compare', { a, b: 26, op }, 'TypeError')).toContain('not the same kind');
      }
    }
  });

  it('still compares values of the same kind', () => {
    expect(good('logic.compare', { a: 'dark', b: 'dark' })).toEqual({ result: true });
    expect(good('logic.compare', { a: null, b: null })).toEqual({ result: true });
    expect(good('logic.compare', { a: 28, b: 26, op: 'gt' })).toEqual({ result: true });
    bad('logic.compare', { a: true, b: false, op: 'gt' }, 'TypeError');
  });

  it('names an absent or null value of between and fails other kinds', () => {
    expect(bad('logic.between', { min: 10, max: 20 }, 'NotFound')).toBe(
      `the value to test is absent; ${hint}`,
    );
    expect(bad('logic.between', { value: null, min: 10, max: 20 }, 'TypeError')).toBe(
      `the value to test is null; ${hint}`,
    );
    for (const value of ['dark', true, [15]]) {
      bad('logic.between', { value, min: 10, max: 20 }, 'TypeError');
    }
    expect(good('logic.between', { value: 15, min: 10, max: 20 })).toEqual({ result: true });
  });

  it('has no other compare mode', () => {
    bad('logic.compare', { a: null, b: 'dark', mismatch: 'false' }, 'TypeError');
    bad('logic.between', { value: 'dark', min: 10, max: 20, mismatch: 'false' }, 'TypeError');
  });
});

describe('logic.between', () => {
  it('tests numbers with and without the ends', () => {
    expect(good('logic.between', { value: 15, min: 10, max: 20 })).toEqual({ result: true });
    expect(good('logic.between', { value: 20, min: 10, max: 20 })).toEqual({ result: true });
    expect(good('logic.between', { value: 20, min: 10, max: 20, inclusive: false })).toEqual({
      result: false,
    });
    expect(good('logic.between', { value: 9, min: 10, max: 20 })).toEqual({ result: false });
    bad('logic.between', { value: 15, min: 20, max: 10 }, 'Invalid');
  });

  it('tests moments and durations', () => {
    expect(
      good('logic.between', {
        value: '2026-10-18T12:00:00Z',
        min: '2026-10-18T11:00:00Z',
        max: '2026-10-18T13:00:00Z',
      }),
    ).toEqual({ result: true });
    expect(good('logic.between', { value: 5000, min: 1000, max: 9000 })).toEqual({ result: true });
  });

  it('wraps times of day over midnight', () => {
    expect(good('logic.between', { value: '23:30', min: '22:00', max: '06:00' })).toEqual({
      result: true,
    });
    expect(good('logic.between', { value: '03:00', min: '22:00', max: '06:00' })).toEqual({
      result: true,
    });
    expect(good('logic.between', { value: '12:00', min: '22:00', max: '06:00' })).toEqual({
      result: false,
    });
    expect(
      good('logic.between', { value: '06:00', min: '22:00', max: '06:00', inclusive: false }),
    ).toEqual({
      result: false,
    });
    expect(good('logic.between', { value: '09:00', min: '08:00', max: '20:00' })).toEqual({
      result: true,
    });
  });

  it('refuses mixed kinds', () => {
    bad('logic.between', { value: 1, min: '08:00', max: 3 }, 'TypeError');
  });
});

describe('logic.in', () => {
  const weather = ['rain', 'drizzle', 'storm'];

  it('finds a value in a list', () => {
    expect(good('logic.in', { value: 'rain', list: weather })).toEqual({ result: true });
    expect(good('logic.in', { value: 'sun', list: weather })).toEqual({ result: false });
    expect(good('logic.in', { value: 'sun', list: weather, negate: true })).toEqual({
      result: true,
    });
    expect(good('logic.in', { value: { a: 1 }, list: [{ a: 1 }] })).toEqual({ result: true });
  });

  it('never matches an absent value', () => {
    expect(good('logic.in', { list: weather })).toEqual({ result: false });
    bad('logic.in', { value: 'x', list: 'x' }, 'TypeError');
  });
});

describe('logic.and, logic.or, logic.not', () => {
  it('combine two to four wired flags', () => {
    expect(good('logic.and', { a: true, b: true })).toEqual({ result: true });
    expect(good('logic.and', { a: true, b: false })).toEqual({ result: false });
    expect(good('logic.and', { a: true, b: true, c: true, d: false })).toEqual({ result: false });
    expect(good('logic.or', { a: false, b: true })).toEqual({ result: true });
    expect(good('logic.or', { a: false, b: false })).toEqual({ result: false });
    expect(good('logic.or', { a: false, b: false, c: false, d: true })).toEqual({ result: true });
    expect(good('logic.not', { flag: false })).toEqual({ result: true });
  });

  it('stop at the first deciding flag without reading the rest', () => {
    const read: string[] = [];
    const lazy = (values: Readonly<Record<string, boolean>>) => (name: string) => {
      read.push(name);
      const value = values[name];
      return value === undefined ? undefined : { ok: true as const, value };
    };
    runPorts('logic.and', ['a', 'b'], lazy({ a: false, b: true }));
    expect(read).toEqual(['a']);
    read.length = 0;
    runPorts('logic.or', ['a', 'b'], lazy({ a: true, b: false }));
    expect(read).toEqual(['a']);
  });

  it('refuse anything that is not a flag', () => {
    expect(bad('logic.and', { a: true, b: 1 }, 'TypeError')).toContain('b');
    bad('logic.or', { a: 'yes', b: true }, 'TypeError');
    bad('logic.not', { flag: 'yes' }, 'TypeError');
    bad('logic.not', {}, 'Invalid');
  });
});

describe('logic.exists', () => {
  it('tests for a value', () => {
    expect(good('logic.exists', { value: 'Kitchen' })).toEqual({ result: true });
    expect(good('logic.exists', {})).toEqual({ result: false });
    expect(good('logic.exists', { value: null })).toEqual({ result: false });
    expect(good('logic.exists', { value: 0 })).toEqual({ result: true });
  });

  it('tests for empty and null', () => {
    expect(good('logic.exists', { value: '', test: 'is_empty' })).toEqual({ result: true });
    expect(good('logic.exists', { value: [], test: 'is_empty' })).toEqual({ result: true });
    expect(good('logic.exists', { value: {}, test: 'is_empty' })).toEqual({ result: true });
    expect(good('logic.exists', { test: 'is_empty' })).toEqual({ result: true });
    expect(good('logic.exists', { value: [1], test: 'is_empty' })).toEqual({ result: false });
    expect(good('logic.exists', { value: 5, test: 'is_empty' })).toEqual({ result: false });
    expect(good('logic.exists', { value: null, test: 'is_null' })).toEqual({ result: true });
    expect(good('logic.exists', { value: 0, test: 'is_null' })).toEqual({ result: false });
  });
});

describe('logic.coalesce', () => {
  it('picks the first available value', () => {
    expect(good('logic.coalesce', { a: null, b: 'Kitchen', c: 'Hall' })).toEqual({
      value: 'Kitchen',
    });
    expect(good('logic.coalesce', { b: null, d: 'Hall' })).toEqual({ value: 'Hall' });
    expect(good('logic.coalesce', { a: null, b: null, default: 'Someone' })).toEqual({
      value: 'Someone',
    });
  });

  it('fails when nothing is available and there is no default', () => {
    bad('logic.coalesce', { a: null }, 'NotFound');
  });

  it('fails with the given message when nothing is available', () => {
    expect(bad('logic.coalesce', { message: 'the input has no value' }, 'NotFound')).toBe(
      'the input has no value',
    );
  });
});

describe('logic.select', () => {
  it('picks a side', () => {
    expect(good('logic.select', { condition: true, whenTrue: 100, whenFalse: 30 })).toEqual({
      value: 100,
    });
    expect(good('logic.select', { condition: false, whenTrue: 100, whenFalse: 30 })).toEqual({
      value: 30,
    });
    expect(good('logic.select', { condition: false, whenTrue: 100 })).toEqual({});
  });

  it('only reads the chosen side', () => {
    const read: string[] = [];
    const values: Record<string, boolean | number> = { condition: true, whenTrue: 1, whenFalse: 2 };
    const result = runPorts('logic.select', Object.keys(values), (name) => {
      read.push(name);
      const value = values[name];
      return value === undefined ? undefined : { ok: true, value };
    });
    expect(result).toEqual({ ok: true, value: { value: 1 } });
    expect(read).toEqual(['condition', 'whenTrue']);
  });
});

describe('logic.time_window', () => {
  it('uses the home zone and crosses midnight', () => {
    expect(
      good('logic.time_window', { at: '2026-10-18T12:00:00Z', after: '08:00', before: '20:00' }),
    ).toEqual({ result: true });
    expect(
      good('logic.time_window', { at: '2026-10-18T14:00:00Z', after: '08:00', before: '20:00' }),
    ).toEqual({ result: false });
    expect(
      good('logic.time_window', { at: '2026-10-18T05:00:00Z', after: '22:00', before: '06:00' }),
    ).toEqual({ result: false });
    expect(
      good('logic.time_window', { at: '2026-10-18T16:00:00Z', after: '22:00', before: '06:00' }),
    ).toEqual({ result: true });
    expect(
      good('logic.time_window', { at: '2026-10-18T13:00:00Z', after: '20:00', before: '20:00' }),
    ).toEqual({ result: false });
  });

  it('defaults to now and filters by days', () => {
    expect(good('logic.time_window', { after: '18:00', before: '20:00' })).toEqual({
      result: true,
    });
    expect(good('logic.time_window', { after: '18:00', before: '20:00', days: ['sun'] })).toEqual({
      result: true,
    });
    expect(
      good('logic.time_window', { after: '18:00', before: '20:00', days: ['mon', 'tue'] }),
    ).toEqual({ result: false });
    expect(NOW).toBeGreaterThan(0);
  });

  it('refuses a malformed time of day', () => {
    bad('logic.time_window', { after: '8am', before: '20:00' }, 'TypeError');
    bad('logic.time_window', { after: '08:00', before: '25:00' }, 'TypeError');
    bad('logic.time_window', { at: 'noon', after: '08:00', before: '20:00' }, 'TypeError');
  });
});

describe('logic.trigger_is', () => {
  it('compares with the trigger that started the run', () => {
    expect(good('logic.trigger_is', { source: 'press' })).toEqual({ result: true });
    expect(good('logic.trigger_is', { source: 'hold' })).toEqual({ result: false });
    expect(good('logic.trigger_is', { source: 'press' }, { ...HOME, trigger: () => null })).toEqual(
      {
        result: false,
      },
    );
  });
});

describe('evaluator plumbing', () => {
  it('passes a failing port through with its class', () => {
    const result = runPorts('logic.select', ['condition'], () => ({
      ok: false,
      class: 'Unreachable',
      message: 'down',
    }));
    expect(result).toEqual({ ok: false, class: 'Unreachable', message: 'down' });
  });

  it('does not hide an unexpected crash behind a failure result', () => {
    expect(() =>
      runPorts('logic.select', ['condition'], () => {
        throw new Error('bug');
      }),
    ).toThrow('bug');
  });
});
