import { describe, expect, it } from 'vitest';
import {
  durationSteppers,
  snapSeconds,
  withMinutes,
  withSeconds,
  type DurationBounds,
} from './duration';

const WHOLE_MINUTES: DurationBounds = { min: 60, max: 18000, step: 60 };
const TEN_SECONDS: DurationBounds = { min: 10, max: 5400, step: 10 };

describe('microwave duration', () => {
  it('moves a duration to the nearest allowed step', () => {
    expect(snapSeconds(95, WHOLE_MINUTES)).toBe(120);
    expect(snapSeconds(89, WHOLE_MINUTES)).toBe(60);
  });

  it('keeps a duration inside the allowed range', () => {
    expect(snapSeconds(0, WHOLE_MINUTES)).toBe(60);
    expect(snapSeconds(99999, WHOLE_MINUTES)).toBe(18000);
  });

  it('never rounds past a maximum that is not on a step', () => {
    expect(snapSeconds(100, { min: 0, max: 95, step: 30 })).toBe(90);
  });

  it('offers only minutes when the microwave steps in whole minutes', () => {
    expect(durationSteppers(WHOLE_MINUTES)).toEqual({
      minutes: { min: 1, max: 300, step: 1 },
      seconds: null,
    });
  });

  it('offers seconds as well when the microwave steps in seconds', () => {
    expect(durationSteppers(TEN_SECONDS)).toEqual({
      minutes: { min: 0, max: 90, step: 1 },
      seconds: { max: 50, step: 10 },
    });
  });

  it('changes minutes without touching seconds and the reverse', () => {
    expect(withMinutes(95, 3)).toBe(215);
    expect(withSeconds(95, 10)).toBe(70);
  });
});
