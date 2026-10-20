import { describe, expect, it } from 'vitest';
import { keepDaysOptions } from './keep-days';

describe('keepDaysOptions', () => {
  it('offers whole days from one day to a year with the 15 day default among them', () => {
    const options = keepDaysOptions(15);
    expect(options[0]).toEqual({ value: '1', label: '1 day' });
    expect(options.map((option) => option.value)).toContain('15');
    expect(options.at(-1)).toEqual({ value: '365', label: '365 days' });
  });

  it('adds a value set elsewhere, such as through the AI, in order', () => {
    expect(keepDaysOptions(20).map((option) => option.value)).toEqual([
      '1',
      '3',
      '7',
      '15',
      '20',
      '30',
      '60',
      '90',
      '180',
      '365',
    ]);
  });
});
