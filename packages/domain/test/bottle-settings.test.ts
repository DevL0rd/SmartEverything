import { describe, expect, it } from 'vitest';
import {
  BOTTLE_COLOURS,
  BOTTLE_HEX,
  UNBOUND,
  bottleChannelsOfHex,
  bottleClockOfSeconds,
  bottleFilterStatusOf,
  bottleHexOfChannels,
  bottleMayStartUv,
  bottleNoticePending,
  secondsOfBottleClock,
  type BottleBinding,
} from '../src';

describe('bottle clock', () => {
  it('writes midnight as the end of the day, which is what the cap expects', () => {
    expect(secondsOfBottleClock('00:00')).toBe(86_400);
    expect(secondsOfBottleClock('08:30')).toBe(30_600);
    expect(secondsOfBottleClock('23:59')).toBe(86_340);
  });

  it('reads the seconds back to the same clock time', () => {
    for (const clock of ['00:00', '00:01', '08:30', '23:59']) {
      expect(bottleClockOfSeconds(secondsOfBottleClock(clock))).toBe(clock);
    }
    expect(bottleClockOfSeconds(1)).toBe('00:00');
  });
});

describe('bottle colours', () => {
  it('turns a colour into light channels and back without drifting', () => {
    for (const colour of BOTTLE_COLOURS) {
      expect(BOTTLE_HEX.safeParse(colour.hex).success).toBe(true);
      expect(bottleHexOfChannels(bottleChannelsOfHex(colour.hex))).toBe(colour.hex);
    }
    expect(bottleChannelsOfHex('#ff0000')).toStrictEqual({ red: 1, green: 0, blue: 0 });
    expect(bottleHexOfChannels({ red: 2, green: -1, blue: 0.5 })).toBe('#ff0080');
  });
});

describe('bottle filter', () => {
  it('has no status without a filter or an install day', () => {
    expect(
      bottleFilterStatusOf(
        { installed: false, type: 'essential', installedOn: null },
        0,
        0,
        '2026-10-18',
      ),
    ).toBeNull();
    expect(
      bottleFilterStatusOf(
        { installed: true, type: 'essential', installedOn: null },
        0,
        0,
        '2026-10-18',
      ),
    ).toBeNull();
  });

  it('replaces by the day limit when little water goes through', () => {
    const status = bottleFilterStatusOf(
      { installed: true, type: 'essential', installedOn: '2026-09-18' },
      20_000,
      0,
      '2026-10-18',
    );
    expect(status).toMatchObject({
      litresUsed: 20,
      litresLimit: 94,
      daysUsed: 30,
      daysLimit: 60,
      replaceBy: '2026-11-17',
      due: false,
    });
    expect(status?.usedPct).toBe(0.5);
  });

  it('replaces sooner when the litres will run out before the days', () => {
    const status = bottleFilterStatusOf(
      { installed: true, type: 'essential', installedOn: '2026-10-08' },
      70_000,
      28_000,
      '2026-10-18',
    );
    expect(status?.replaceBy).toBe('2026-10-30');
    expect(status?.usedPct).toBeCloseTo(70 / 94, 5);
  });

  it('is due once either limit is passed, and uses the larger advanced filter', () => {
    const base = { installed: true, installedOn: '2026-10-01' } as const;
    expect(bottleFilterStatusOf({ ...base, type: 'essential' }, 94_000, 0, '2026-10-18')?.due).toBe(
      true,
    );
    expect(bottleFilterStatusOf({ ...base, type: 'advanced' }, 94_000, 0, '2026-10-18')?.due).toBe(
      false,
    );
    expect(
      bottleFilterStatusOf(
        { ...base, installedOn: '2026-08-01', type: 'advanced' },
        0,
        0,
        '2026-10-18',
      )?.due,
    ).toBe(true);
    expect(
      bottleFilterStatusOf(
        { ...base, installedOn: '2026-12-01', type: 'advanced' },
        0,
        0,
        '2026-10-18',
      )?.daysUsed,
    ).toBe(0);
  });
});

describe('bottle binding', () => {
  const owner = '8a1b3c2d-0000-4000-8000-000000000001';
  const ida = '8a1b3c2d-0000-4000-8000-000000000002';
  const bound: BottleBinding = {
    profileId: ida,
    boundBy: owner,
    boundAt: '2026-10-18T10:00:00.000Z',
    keptAt: null,
  };

  it('tells the bound person, and only them, that someone bound the bottle to them', () => {
    expect(bottleNoticePending(bound, ida)).toBe(true);
    expect(bottleNoticePending(bound, owner)).toBe(false);
    expect(bottleNoticePending(UNBOUND, ida)).toBe(false);
  });

  it('stops asking once the person keeps it, and never asks about their own binding', () => {
    expect(bottleNoticePending({ ...bound, keptAt: '2026-10-18T11:00:00.000Z' }, ida)).toBe(false);
    expect(bottleNoticePending({ ...bound, boundBy: ida }, ida)).toBe(false);
  });

  it('lets the owner and the bound person start a clean, and nobody else', () => {
    expect(bottleMayStartUv(bound, { owner: true, profileId: owner })).toBe(true);
    expect(bottleMayStartUv(bound, { owner: false, profileId: ida })).toBe(true);
    expect(
      bottleMayStartUv(bound, { owner: false, profileId: '8a1b3c2d-0000-4000-8000-000000000003' }),
    ).toBe(false);
    expect(bottleMayStartUv(UNBOUND, { owner: false, profileId: ida })).toBe(false);
  });
});
