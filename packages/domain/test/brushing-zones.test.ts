import { describe, expect, it } from 'vitest';
import {
  stepSeconds,
  stepsOf,
  zoneAt,
  zoneNamesOf,
  zoneSeconds,
  zonesMissed,
  zonesReached,
} from '../src';

describe('the pacing steps of a mode', () => {
  it('walks six zones in order for clean, sensitive and deep clean', () => {
    for (const mode of ['clean', 'sensitive', 'deep_clean_plus'] as const) {
      expect(stepsOf(mode, 6)).toStrictEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('revisits the front zones in White+ and four zones in Gum Health', () => {
    expect(stepsOf('white_plus', 6)).toStrictEqual([1, 2, 3, 4, 5, 6, 2, 5]);
    expect(stepsOf('gum_health', 6)).toStrictEqual([1, 2, 3, 4, 5, 6, 1, 3, 4, 6]);
  });

  it('has no zones for tongue care and four quadrants for kids whatever the mode', () => {
    expect(stepsOf('tongue_care', 6)).toStrictEqual([]);
    expect(stepsOf('white_plus', 4)).toStrictEqual([1, 2, 3, 4]);
    expect(stepsOf('clean', 0)).toStrictEqual([]);
  });

  it('names zones in plain words', () => {
    expect(zoneNamesOf(6)).toHaveLength(6);
    expect(zoneNamesOf(4)).toStrictEqual([
      'Upper left',
      'Upper right',
      'Lower right',
      'Lower left',
    ]);
    expect(zoneNamesOf(0)).toStrictEqual([]);
  });
});

describe('the zone at a second', () => {
  it('splits the routine evenly across the steps', () => {
    expect(stepSeconds('clean', 6, 120)).toBe(20);
    expect(zoneAt('clean', 6, 0, 120)).toBe(1);
    expect(zoneAt('clean', 6, 19, 120)).toBe(1);
    expect(zoneAt('clean', 6, 20, 120)).toBe(2);
    expect(zoneAt('clean', 6, 119, 120)).toBe(6);
  });

  it('stays on the last zone when the timer runs past the routine', () => {
    expect(zoneAt('clean', 6, 400, 120)).toBe(6);
  });

  it('returns nothing without zones, a routine or time', () => {
    expect(zoneAt('tongue_care', 6, 30, 120)).toBeNull();
    expect(zoneAt('clean', 6, -1, 120)).toBeNull();
    expect(zoneAt('clean', 6, 30, 0)).toBeNull();
  });
});

describe('what a stopped session covered', () => {
  it('adds up seconds per zone including revisited zones', () => {
    const seconds = zoneSeconds('white_plus', 6, 160, 160);
    expect(seconds).toStrictEqual([20, 40, 20, 20, 40, 20]);
  });

  it('stops counting where the session stopped', () => {
    expect(zoneSeconds('clean', 6, 50, 120)).toStrictEqual([20, 20, 10, 0, 0, 0]);
    expect(zonesReached('clean', 6, 50, 120)).toStrictEqual([1, 2, 3]);
    expect(zonesMissed('clean', 6, 50, 120)).toStrictEqual([4, 5, 6]);
  });

  it('reports no zones for tongue care and an all-zero list for no routine', () => {
    expect(zonesReached('tongue_care', 6, 100, 120)).toStrictEqual([]);
    expect(zoneSeconds('clean', 6, 100, 0)).toStrictEqual([0, 0, 0, 0, 0, 0]);
    expect(zonesMissed('tongue_care', 6, 10, 120)).toStrictEqual([]);
  });
});

describe('modes without their own pacing steps', () => {
  it('sweeps the quadrants for a four-zone brush whatever the mode', () => {
    expect(stepsOf('daily_clean', 4)).toStrictEqual([1, 2, 3, 4]);
    expect(zoneSeconds('gum_care', 4, 120, 120)).toStrictEqual([30, 30, 30, 30]);
  });

  it('uses the plain sweep of the zone count for a six-zone brush', () => {
    expect(stepsOf('whiten', 6)).toStrictEqual([1, 2, 3, 4, 5, 6]);
    expect(stepSeconds('intense', 6, 120)).toBe(20);
  });

  it('reports no steps without zones', () => {
    expect(stepsOf('smart_adapt', 0)).toStrictEqual([]);
    expect(zoneAt('smart_adapt', 0, 30, 120)).toBeNull();
  });
});
