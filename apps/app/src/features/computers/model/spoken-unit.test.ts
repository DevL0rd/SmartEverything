import { describe, expect, it } from 'vitest';
import { spokenFact, spokenUnit } from './spoken-unit';

describe('spoken units', () => {
  it('says each unit as words', () => {
    expect(spokenUnit('%')).toBe('percent');
    expect(spokenUnit('°C')).toBe('degrees');
    expect(spokenUnit('MB/s')).toBe('megabytes per second');
    expect(spokenUnit('W of 55')).toBe('watts of 55');
    expect(spokenUnit(undefined)).toBe('');
  });

  it('joins the label, value and unit', () => {
    expect(spokenFact('CPU', '24', '%')).toBe('CPU 24 percent');
    expect(spokenFact('', '24', '%')).toBe('24 percent');
    expect(spokenFact('Download', '7.7', 'MB/s')).toBe('Download 7.7 megabytes per second');
  });
});
