import { JSON_VALUE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { HOME, bad, good, type Given } from './support';
import type { PureEnvironment } from '../../../src/nodes/pure/index';

describe('object.remove', () => {
  const source = { a: { b: 1, c: 2 }, d: [1, 2, 3] };

  it('removes a field or a list item by path without touching the input', () => {
    expect(good('object.remove', { source, path: 'a.b' })['record']).toEqual({
      a: { c: 2 },
      d: [1, 2, 3],
    });
    expect(good('object.remove', { source, path: 'd[1]' })['record']).toEqual({
      a: { b: 1, c: 2 },
      d: [1, 3],
    });
    expect(good('object.remove', { source, path: 'a' })['record']).toEqual({ d: [1, 2, 3] });
    expect(source.a).toEqual({ b: 1, c: 2 });
  });

  it('fails on a missing path unless told to ignore it', () => {
    bad('object.remove', { source, path: 'a.x' }, 'NotFound');
    bad('object.remove', { source, path: '__proto__.x' }, 'NotFound');
    bad('object.remove', { source, path: 'a..b' }, 'Invalid');
    expect(good('object.remove', { source, path: 'a.x', ignoreMissing: true })['record']).toEqual(
      source,
    );
  });
});

describe('object.merge', () => {
  const records = [{ a: { x: 1 }, b: 1 }, { a: { y: 2 } }];

  it('lets a later record win, shallow or deep', () => {
    expect(good('object.merge', { records })['record']).toEqual({ a: { y: 2 }, b: 1 });
    expect(good('object.merge', { records, deep: true })['record']).toEqual({
      a: { x: 1, y: 2 },
      b: 1,
    });
    expect(good('object.merge', { records: [] })['record']).toEqual({});
  });

  it('refuses non-records and unsafe field names', () => {
    bad('object.merge', { records: [{}, 3] }, 'TypeError');
    const unsafe = JSON_VALUE.parse(JSON.parse('{"__proto__": 1}'));
    bad('object.merge', { records: [{ a: 1 }, unsafe] }, 'Invalid');
  });
});

describe('object.fields, object.pick', () => {
  it('takes a record apart and builds one from entries', () => {
    expect(good('object.fields', { source: { a: 1, b: 'x' } })).toEqual({
      keys: ['a', 'b'],
      values: [1, 'x'],
      entries: [
        { key: 'a', value: 1 },
        { key: 'b', value: 'x' },
      ],
    });
    expect(
      good('object.fields', {
        entries: [
          { key: 'a', value: 1 },
          { key: 'a', value: 2 },
        ],
      }),
    ).toEqual({ record: { a: 2 } });
  });

  it('wants exactly one of a record and entries', () => {
    bad('object.fields', {}, 'Invalid');
    bad('object.fields', { source: {}, entries: [] }, 'Invalid');
    bad('object.fields', { entries: [{ key: 1, value: 1 }] }, 'TypeError');
    bad('object.fields', { source: 5 }, 'TypeError');
  });

  it('keeps or drops listed fields and ignores missing ones', () => {
    const source = { a: 1, b: 2 };
    expect(good('object.pick', { source, keys: ['a', 'zz'] })['record']).toEqual({ a: 1 });
    expect(good('object.pick', { source, keys: ['a'], mode: 'drop' })['record']).toEqual({ b: 2 });
    bad('object.pick', { source, keys: ['a'], mode: 'swap' }, 'Invalid');
    bad('object.pick', { source, keys: [1] }, 'TypeError');
  });
});

describe('date.start_of', () => {
  const at = (unit: string, edge: string, instant = '2026-10-18T12:00:00.000Z'): unknown =>
    good('date.start_of', { instant, unit, edge })['instant'];

  it('finds the start and the last millisecond of each part in the home zone', () => {
    expect(at('day', 'start')).toBe('2026-10-17T17:00:00.000Z');
    expect(at('day', 'end')).toBe('2026-10-18T16:59:59.999Z');
    expect(at('week', 'start')).toBe('2026-10-11T17:00:00.000Z');
    expect(at('week', 'end')).toBe('2026-10-18T16:59:59.999Z');
    expect(at('month', 'start')).toBe('2026-09-30T17:00:00.000Z');
    expect(at('month', 'end')).toBe('2026-10-31T16:59:59.999Z');
    expect(at('year', 'start')).toBe('2025-12-31T17:00:00.000Z');
    expect(at('year', 'end')).toBe('2026-12-31T16:59:59.999Z');
  });

  it('starts the week on Monday and rolls the year over in December', () => {
    expect(at('week', 'start', '2026-10-19T03:00:00.000Z')).toBe('2026-10-18T17:00:00.000Z');
    expect(at('month', 'end', '2026-12-15T12:00:00.000Z')).toBe('2026-12-31T16:59:59.999Z');
  });

  it('follows the clock change: a 25 hour day in autumn', () => {
    const berlin: PureEnvironment = { ...HOME, timeZone: 'Europe/Berlin' };
    const run = (edge: string): unknown =>
      good('date.start_of', { instant: '2026-10-25T10:00:00.000Z', unit: 'day', edge }, berlin)[
        'instant'
      ];
    expect(run('start')).toBe('2026-10-24T22:00:00.000Z');
    expect(run('end')).toBe('2026-10-25T22:59:59.999Z');
  });

  it('refuses an unknown part or edge', () => {
    bad('date.start_of', { instant: '2026-10-18T12:00:00.000Z', unit: 'decade' }, 'Invalid');
    bad('date.start_of', { instant: '2026-10-18T12:00:00.000Z', edge: 'middle' }, 'Invalid');
    bad('date.start_of', { instant: 'soon' }, 'TypeError');
  });
});

describe('date.next', () => {
  const next = (given: Given, environment = HOME): unknown =>
    good('date.next', given, environment)['instant'];

  it('is strictly after the starting moment', () => {
    expect(next({ clock: '19:00' })).toBe('2026-10-19T12:00:00.000Z');
    expect(next({ clock: '20:00' })).toBe('2026-10-18T13:00:00.000Z');
  });

  it('waits for the chosen weekday', () => {
    expect(next({ clock: '06:30', days: ['mon'] })).toBe('2026-10-18T23:30:00.000Z');
    expect(next({ clock: '06:30', days: ['sun'] })).toBe('2026-10-24T23:30:00.000Z');
  });

  it('starts from a given moment', () => {
    expect(next({ clock: '12:00', after: '2026-10-20T00:00:00.000Z' })).toBe(
      '2026-10-20T05:00:00.000Z',
    );
  });

  it('crosses the autumn clock change at the right wall time', () => {
    const berlin: PureEnvironment = { ...HOME, timeZone: 'Europe/Berlin' };
    expect(next({ clock: '12:00', after: '2026-10-24T12:00:00.000Z' }, berlin)).toBe(
      '2026-10-25T11:00:00.000Z',
    );
  });

  it('refuses a bad time or weekday', () => {
    bad('date.next', { clock: '25:00' }, 'TypeError');
    bad('date.next', { clock: '10:00', days: ['xyz'] }, 'TypeError');
  });
});
