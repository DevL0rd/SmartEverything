import { describe, expect, it } from 'vitest';
import { sourceRows, sourceSummary } from './source-model';

describe('water sources', () => {
  it('shares the day out between the sources and leaves out the empty ones', () => {
    const rows = sourceRows({ bottleMl: 600, loggedMl: 0, otherMl: 200 });
    expect(rows.map((row) => row.key)).toEqual(['bottle', 'other']);
    expect(rows[0]?.share).toBeCloseTo(0.75);
  });

  it('has no rows when nothing was drunk', () => {
    expect(sourceRows({ bottleMl: 0, loggedMl: 0, otherMl: 0 })).toEqual([]);
    expect(sourceSummary({ bottleMl: 0, loggedMl: 0, otherMl: 0 })).toBe('No water recorded.');
  });

  it('says every source in words', () => {
    const text = sourceSummary({ bottleMl: 300, loggedMl: 100, otherMl: 100 }).replaceAll(' ', ' ');
    expect(text).toBe(
      'Where the water comes from: Bottle 300 ml, 60 %; Logged here 100 ml, 20 %; Other apps 100 ml, 20 %.',
    );
  });
});
