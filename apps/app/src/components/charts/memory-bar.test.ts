import { describe, expect, it } from 'vitest';
import { memorySummary, segmentShare } from './memory-bar';

describe('memorySummary', () => {
  it('lists every part and the total for assistive technology', () => {
    expect(
      memorySummary(
        32,
        [
          { label: 'Used', value: 12.34 },
          { label: 'Free', value: 19.66 },
        ],
        'GB',
      ),
    ).toBe('Used 12.3 GB, Free 19.7 GB of 32 GB');
  });
});

describe('segmentShare', () => {
  it('turns a part into its percentage of the whole', () => {
    expect(segmentShare(8, 32)).toBe(0.25);
  });

  it('never leaves the bar, and copes with an empty total', () => {
    expect(segmentShare(40, 32)).toBe(1);
    expect(segmentShare(-1, 32)).toBe(0);
    expect(segmentShare(5, 0)).toBe(0);
  });
});
