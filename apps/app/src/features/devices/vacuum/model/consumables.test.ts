import { VACUUM_SERVICE_ACTION_ROLES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../../format/time';
import {
  CONSUMABLE_PARTS,
  careWarning,
  consumablesOf,
  lifeForecast,
  replaceAround,
  toneOf,
} from './consumables';

describe('consumables', () => {
  it('lists the parts the robot reports in the design order', () => {
    const views = consumablesOf({
      vacuum_roller_life: 80,
      vacuum_main_brush_life: 60,
      vacuum_detergent_level: 100,
      filter_life: 40,
    });
    expect(views.map((view) => view.part)).toStrictEqual([
      'main_brush',
      'filter',
      'roller_mop',
      'detergent',
    ]);
    expect(consumablesOf({})).toStrictEqual([]);
  });

  it('uses only real reset roles, one per part', () => {
    const roles = CONSUMABLE_PARTS.map((part) => part.resetRole);
    expect(new Set(roles).size).toBe(roles.length);
    for (const role of roles) {
      expect(VACUUM_SERVICE_ACTION_ROLES).toContain(role);
    }
  });

  it('sets tone and advice at the 30 and 10 percent edges', () => {
    expect(toneOf(31)).toBe('positive');
    expect(toneOf(30)).toBe('warning');
    expect(toneOf(10)).toBe('warning');
    expect(toneOf(9.9)).toBe('critical');
    expect(toneOf(null)).toBe('unknown');
    const [soon, now, fine] = consumablesOf({
      vacuum_main_brush_life: 25,
      vacuum_side_brush_life: 4,
      filter_life: 90,
    });
    expect([soon?.adviceWord, now?.adviceWord, fine?.adviceWord]).toStrictEqual([
      'Replace soon',
      'Replace now',
      null,
    ]);
  });

  it('keeps the life between 0 and 100 and ignores values that are not numbers', () => {
    const [high, low, odd] = consumablesOf({
      vacuum_main_brush_life: 140,
      vacuum_side_brush_life: -3,
      filter_life: 'half',
    });
    expect(high?.lifePercent).toBe(100);
    expect(low?.lifePercent).toBe(0);
    expect(odd).toBeUndefined();
  });

  it('shows the time left in hours, but not for the dust bag whose unit is unconfirmed', () => {
    const views = consumablesOf({
      vacuum_main_brush_life: 47,
      vacuum_main_brush_left: 140.4,
      vacuum_dust_bag_life: 70,
      vacuum_dust_bag_left: 55,
    });
    expect(views[0]?.timeLeftText).toBe('about 140 h of cleaning');
    expect(views[1]).toMatchObject({ part: 'dust_bag', hoursLeft: null, timeLeftText: null });
  });

  it('names the part that is due when one is at or under 10 percent', () => {
    expect(careWarning(consumablesOf({ filter_life: 11 }))).toBeNull();
    expect(careWarning(consumablesOf({ filter_life: 10 }))).toBe('Filter due');
    expect(
      careWarning(
        consumablesOf({
          filter_life: 8,
          vacuum_side_brush_life: 3,
          vacuum_detergent_level: 5,
        }),
      ),
    ).toBe('Side brush due');
    expect(careWarning(consumablesOf({ vacuum_detergent_level: 5 }))).toBe('Detergent low');
  });
});

const DAY0 = Date.UTC(2026, 6, 1);

describe('consumable life forecast', () => {
  it('projects the average daily use to zero', () => {
    const forecast = lifeForecast([
      { t: DAY0, v: 100 },
      { t: DAY0 + 10 * DAY_MS, v: 90 },
      { t: DAY0 + 20 * DAY_MS, v: 80 },
    ]);
    expect(forecast?.dailyUsePercent).toBeCloseTo(1);
    expect(forecast?.replaceAtMs).toBeCloseTo(DAY0 + 100 * DAY_MS);
    expect(forecast?.line).toStrictEqual([
      { t: DAY0 + 20 * DAY_MS, v: 80 },
      { t: forecast?.replaceAtMs, v: 0 },
    ]);
    if (forecast !== null) {
      expect(replaceAround(forecast)).toContain('Replace around ');
    }
  });

  it('starts again after a reset', () => {
    const forecast = lifeForecast([
      { t: DAY0, v: 100 },
      { t: DAY0 + 20 * DAY_MS, v: 20 },
      { t: DAY0 + 21 * DAY_MS, v: 100 },
      { t: DAY0 + 31 * DAY_MS, v: 95 },
    ]);
    expect(forecast?.dailyUsePercent).toBeCloseTo(0.5);
    expect(forecast?.replaceAtMs).toBeCloseTo(DAY0 + 31 * DAY_MS + 190 * DAY_MS);
  });

  it('gives no forecast without a day of data, without use, or without points', () => {
    expect(lifeForecast([])).toBeNull();
    expect(lifeForecast([{ t: DAY0, v: 50 }])).toBeNull();
    expect(
      lifeForecast([
        { t: DAY0, v: 50 },
        { t: DAY0 + DAY_MS / 2, v: 49 },
      ]),
    ).toBeNull();
    expect(
      lifeForecast([
        { t: DAY0, v: 50 },
        { t: DAY0 + 5 * DAY_MS, v: 50 },
      ]),
    ).toBeNull();
  });

  it('puts the replace date at the last point when the part is already used up', () => {
    const forecast = lifeForecast([
      { t: DAY0, v: 10 },
      { t: DAY0 + 5 * DAY_MS, v: 0 },
    ]);
    expect(forecast?.replaceAtMs).toBe(DAY0 + 5 * DAY_MS);
  });
});
