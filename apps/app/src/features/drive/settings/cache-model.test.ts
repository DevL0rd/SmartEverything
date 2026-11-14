import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_DRIVE_CACHE, DESKTOP_DRIVE_CACHE } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import {
  DURATION_PROBLEM,
  OFF,
  SIZE_PROBLEM,
  cacheSizeProblemOf,
  cacheWith,
  durationInitialOf,
  durationProblemOf,
  durationSecondsOf,
  durationText,
  optionalSizeText,
} from './cache-model';

const GIB = 1024 ** 3;

describe('durations', () => {
  it('reads minutes by default and s, m, h and d units', () => {
    expect(durationSecondsOf('30')).toBe(1800);
    expect(durationSecondsOf('90s')).toBe(90);
    expect(durationSecondsOf('15 min')).toBe(900);
    expect(durationSecondsOf('1.5h')).toBe(5400);
    expect(durationSecondsOf('2 Days')).toBe(172_800);
  });

  it('refuses zero, unknown units and words', () => {
    expect(durationSecondsOf('0')).toBeNull();
    expect(durationSecondsOf('5 weeks')).toBeNull();
    expect(durationSecondsOf('soon')).toBeNull();
    expect(durationProblemOf('soon')).toBe(DURATION_PROBLEM);
    expect(durationProblemOf('1h')).toBeNull();
  });

  it('names a time in its largest whole unit and edits it in the same unit', () => {
    expect(durationText(3600)).toBe('1 hour');
    expect(durationText(60)).toBe('1 minute');
    expect(durationText(5400)).toBe('90 minutes');
    expect(durationText(45)).toBe('45 seconds');
    expect(durationText(172_800)).toBe('2 days');
    expect(durationInitialOf(3600)).toBe('1h');
    expect(durationInitialOf(5400)).toBe('90m');
    expect(durationInitialOf(45)).toBe('45s');
    expect(durationSecondsOf(durationInitialOf(5400))).toBe(5400);
  });
});

describe('sizes', () => {
  it('shows an unset size as off', () => {
    expect(optionalSizeText(null)).toBe(OFF);
    expect(optionalSizeText(2 * GIB)).toBe(bytes(2 * GIB));
  });

  it('accepts a size above zero only', () => {
    expect(cacheSizeProblemOf('50')).toBeNull();
    expect(cacheSizeProblemOf('0')).toBe(SIZE_PROBLEM);
    expect(cacheSizeProblemOf('lots')).toBe(SIZE_PROBLEM);
  });
});

describe('cacheWith', () => {
  it('changes one field and keeps the rest, and an empty size turns the limit off', () => {
    const sized = cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'maxBytes', '50');
    expect(sized).toEqual({ ...DEFAULT_DESKTOP_DRIVE_CACHE, maxBytes: 50 * GIB });
    expect(cacheWith(sized, 'maxBytes', '')).toEqual(DEFAULT_DESKTOP_DRIVE_CACHE);
    expect(cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'minFreeBytes', '1.5').minFreeBytes).toBe(
      1.5 * GIB,
    );
    expect(cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'maxAgeSeconds', '2h').maxAgeSeconds).toBe(7200);
    expect(cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'cleanupSeconds', '30s').cleanupSeconds).toBe(30);
  });

  it('builds settings the desktop accepts', () => {
    const cache = cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'maxBytes', '0.5');
    expect(DESKTOP_DRIVE_CACHE.parse(cache)).toEqual(cache);
  });

  it('refuses a time it cannot read', () => {
    expect(() => cacheWith(DEFAULT_DESKTOP_DRIVE_CACHE, 'maxAgeSeconds', 'never')).toThrow(
      'never is not a length of time.',
    );
  });
});
