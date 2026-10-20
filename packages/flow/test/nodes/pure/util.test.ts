import { describe, expect, it } from 'vitest';
import { bad, good } from './support';

describe('util.convert', () => {
  it('converts to a number', () => {
    expect(good('util.convert', { value: '42', to: 'number' })).toEqual({ result: 42, ok: true });
    expect(good('util.convert', { value: ' 4.5 ', to: 'number' })).toEqual({
      result: 4.5,
      ok: true,
    });
    expect(good('util.convert', { value: 7, to: 'number' })).toEqual({ result: 7, ok: true });
    expect(bad('util.convert', { value: 'abc', to: 'number' }, 'Invalid')).toContain('"abc"');
    bad('util.convert', { value: '', to: 'number' }, 'Invalid');
    bad('util.convert', { value: true, to: 'number' }, 'Invalid');
  });

  it('uses the default instead of failing', () => {
    expect(good('util.convert', { value: 'abc', to: 'number', default: 0 })).toEqual({
      result: 0,
      ok: false,
    });
  });

  it('converts to text, flag and list', () => {
    expect(good('util.convert', { value: 3, to: 'text' })).toEqual({ result: '3', ok: true });
    expect(good('util.convert', { value: true, to: 'text' })).toEqual({ result: 'true', ok: true });
    expect(good('util.convert', { value: { a: 1 }, to: 'text' })).toEqual({
      result: '{"a":1}',
      ok: true,
    });
    bad('util.convert', { value: null, to: 'text' }, 'Invalid');
    expect(good('util.convert', { value: 'On', to: 'boolean' })).toEqual({
      result: true,
      ok: true,
    });
    expect(good('util.convert', { value: 'no', to: 'boolean' })).toEqual({
      result: false,
      ok: true,
    });
    expect(good('util.convert', { value: 1, to: 'boolean' })).toEqual({ result: true, ok: true });
    expect(good('util.convert', { value: false, to: 'boolean' })).toEqual({
      result: false,
      ok: true,
    });
    bad('util.convert', { value: 'maybe', to: 'boolean' }, 'Invalid');
    bad('util.convert', { value: [1], to: 'boolean' }, 'Invalid');
    expect(good('util.convert', { value: [1], to: 'list' })).toEqual({ result: [1], ok: true });
    expect(good('util.convert', { value: 1, to: 'list' })).toEqual({ result: [1], ok: true });
    expect(good('util.convert', { value: null, to: 'list' })).toEqual({ result: [], ok: true });
  });

  it('converts to a duration and a moment', () => {
    expect(good('util.convert', { value: '1h30m', to: 'duration' })).toEqual({
      result: 5_400_000,
      ok: true,
    });
    expect(good('util.convert', { value: '250ms', to: 'duration' })).toEqual({
      result: 250,
      ok: true,
    });
    expect(good('util.convert', { value: '1.5s', to: 'duration' })).toEqual({
      result: 1500,
      ok: true,
    });
    expect(good('util.convert', { value: 1000, to: 'duration' })).toEqual({
      result: 1000,
      ok: true,
    });
    bad('util.convert', { value: -1, to: 'duration' }, 'Invalid');
    bad('util.convert', { value: 'soon', to: 'duration' }, 'Invalid');
    expect(good('util.convert', { value: '2026-10-18T12:00:00Z', to: 'instant' })).toEqual({
      result: '2026-10-18T12:00:00Z',
      ok: true,
    });
    bad('util.convert', { value: 'yesterday', to: 'instant' }, 'Invalid');
    bad('util.convert', { value: 1, to: 'colour' }, 'Invalid');
  });
});

describe('util.lookup', () => {
  const rows = [
    { key: 1, value: 1 },
    { key: 2, value: 25 },
    { key: 3, value: 50 },
    { key: 4, value: 75 },
    { key: 5, value: 100 },
  ];

  it('maps the step to a brightness', () => {
    expect(good('util.lookup', { key: 3, rows })).toEqual({ value: 50, found: true });
    expect(good('util.lookup', { key: 5, rows })).toEqual({ value: 100, found: true });
  });

  it('falls back to the default or reports not found', () => {
    expect(good('util.lookup', { key: 9, rows, default: 0 })).toEqual({ value: 0, found: false });
    expect(good('util.lookup', { key: 9, rows })).toEqual({ found: false });
    bad('util.lookup', { key: 1, rows: [{ key: 1 }] }, 'Invalid');
    bad('util.lookup', { key: 1, rows: [3] }, 'Invalid');
  });
});
