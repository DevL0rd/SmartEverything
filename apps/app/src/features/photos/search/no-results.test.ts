import { describe, expect, it } from 'vitest';
import { noResultsBodyOf, noResultsTitleOf, wholeAppQueryOf } from './no-results';

const PORTUGAL = { kind: 'country' as const, countryCode: 'PT', label: 'Portugal' };

describe('the no results state', () => {
  it('names what was searched and hands the words to the app search', () => {
    const search = { tokens: [PORTUGAL], text: 'red bicycle' };
    expect(noResultsTitleOf(search)).toBe('Nothing matches “Portugal · red bicycle”');
    expect(wholeAppQueryOf(search)).toBe('Portugal red bicycle');
  });

  it('suggests fewer filters only when the search holds filters', () => {
    expect(noResultsBodyOf({ tokens: [PORTUGAL], text: '' })).toContain('fewer filters');
    expect(noResultsBodyOf({ tokens: [], text: 'castle' })).not.toContain('filters');
  });
});
