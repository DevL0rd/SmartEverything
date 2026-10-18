import { describe, expect, it } from 'vitest';
import { headlineOf } from './computer-headlines';

describe('headlineOf', () => {
  it('reads the last reported number with its time', () => {
    const values = { cpu_load: { value: 24, observedAt: '2026-10-17T14:02:00.000Z' } };
    expect(headlineOf(values, 'cpu_load')).toStrictEqual({
      value: 24,
      at: '2026-10-17T14:02:00.000Z',
    });
  });

  it('is null when the computer never reported it or reported something else', () => {
    const values = { gpu_load: { value: 'x', observedAt: '2026-10-17T14:02:00.000Z' } };
    expect(headlineOf(values, 'cpu_load')).toBeNull();
    expect(headlineOf(values, 'gpu_load')).toBeNull();
  });
});
