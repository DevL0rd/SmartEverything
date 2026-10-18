import { describe, expect, it } from 'vitest';
import type { Cycle } from './cycles';
import { countsText, drumCleanOf, drumCleanText, isDue } from './maintenance-model';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const DAY = 86_400_000;

function cycle(
  id: number,
  program: string,
  daysAgo: number,
  outcome: Cycle['outcome'] = 'completed',
): Cycle {
  return {
    id: String(id),
    program,
    startedAt: null,
    finishedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    minutes: 60,
    energy: null,
    water: null,
    outcome,
  };
}

describe('laundry maintenance', () => {
  it('knows when the drum was last cleaned', () => {
    const clean = drumCleanOf([cycle(1, 'Cotton', 1), cycle(2, 'Drum clean', 12)], NOW);
    expect(clean).toMatchObject({ daysAgo: 12, due: false });
    expect(drumCleanText(clean)).toBe('Last cleaned 12 days ago');
  });

  it('flags the drum clean after 30 days or 30 cycles', () => {
    expect(drumCleanOf([cycle(1, 'Drum clean', 41)], NOW).due).toBe(true);
    expect(drumCleanText(drumCleanOf([cycle(1, 'Drum clean', 41)], NOW))).toBe(
      'Last cleaned 41 days ago · due',
    );
    const many = Array.from({ length: 31 }, (_, index) => cycle(index, 'Cotton', index));
    expect(drumCleanOf(many, NOW).due).toBe(true);
    expect(drumCleanText(drumCleanOf(many, NOW))).toBe('Not cleaned for a while · due');
  });

  it('ignores a stopped drum clean', () => {
    expect(drumCleanOf([cycle(1, 'Drum clean', 2, 'stopped')], NOW).lastAt).toBeNull();
    expect(drumCleanText(drumCleanOf([], NOW))).toBe('No clean on record yet');
  });

  it('adds up what needs attention', () => {
    const fine = { lastAt: null, daysAgo: null, due: false };
    expect(isDue({}, fine)).toBe(false);
    expect(isDue({ filter_clean: true }, fine)).toBe(true);
    expect(isDue({ detergent_level: 'Low' }, fine)).toBe(true);
    expect(isDue({ softener_level: 'Low' }, fine)).toBe(true);
    expect(isDue({ tank_clean_minutes: 12 }, fine)).toBe(true);
    expect(isDue({}, { ...fine, due: true })).toBe(true);
  });

  it('words the wash and dry counts', () => {
    expect(countsText(312, 48)).toBe('312 washes · 48 dries');
    expect(countsText(312, undefined)).toBe('312 washes');
    expect(countsText(undefined, undefined)).toBeNull();
  });
});
