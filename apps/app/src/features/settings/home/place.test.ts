import { describe, expect, it } from 'vitest';
import { sunLines, timeZoneOptions } from './place';

describe('sunLines', () => {
  it('gives sunrise and sunset in the clock of the home zone', () => {
    const lines = sunLines(
      { latitude: 51.5, longitude: -0.12 },
      'Europe/London',
      new Date('2026-06-21T12:00:00Z'),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Sunrise .*(4|5)/);
    expect(lines[1]).toMatch(/^Sunset .*(8|9)/);
  });

  it('says there is no sunrise or sunset in a polar summer or winter', () => {
    const north = { latitude: 80, longitude: 0 };
    expect(sunLines(north, 'UTC', new Date('2026-06-21T12:00:00Z'))).toEqual([
      'No sunrise or sunset today',
    ]);
    expect(sunLines(north, 'UTC', new Date('2026-12-21T12:00:00Z'))).toEqual([
      'No sunrise or sunset today',
    ]);
  });
});

describe('timeZoneOptions', () => {
  it('starts with UTC and lists real zones with their offsets', () => {
    const options = timeZoneOptions();
    expect(options?.[0]?.value).toBe('UTC');
    expect(options?.some((option) => option.value === 'Europe/London')).toBe(true);
    expect(options?.every((option) => option.label.length > 0)).toBe(true);
  });

  it('builds the list once', () => {
    expect(timeZoneOptions()).toBe(timeZoneOptions());
  });
});
