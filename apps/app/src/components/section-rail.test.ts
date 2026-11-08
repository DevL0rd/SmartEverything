import { describe, expect, it } from 'vitest';
import { railEntryLabel, type RailEntry } from './section-rail';

const ENTRY: RailEntry = {
  id: 'albums',
  label: 'Albums',
  icon: 'image',
  missing: null,
  detail: null,
};

describe('section rail entry label', () => {
  it('reads the plain label when there is no count and nothing is missing', () => {
    expect(railEntryLabel(ENTRY)).toBe('Albums');
  });

  it('reads the trailing count after the label', () => {
    expect(railEntryLabel({ ...ENTRY, count: '1,204' })).toBe('Albums, 1,204');
  });

  it('keeps the missing reason last and skips an empty count', () => {
    expect(railEntryLabel({ ...ENTRY, count: '', missing: 'Not available on Linux yet' })).toBe(
      'Albums, Not available on Linux yet',
    );
    expect(railEntryLabel({ ...ENTRY, count: '24', missing: 'Offline' })).toBe(
      'Albums, 24, Offline',
    );
  });
});
