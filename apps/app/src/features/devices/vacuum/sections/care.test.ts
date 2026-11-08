import { describe, expect, it } from 'vitest';
import { DAY_MS, shortDate } from '../../../../format/time';
import { consumablesOf, type ConsumableView, type LifeForecast } from '../model/consumables';
import { adviceLabel, careSummaryOf, daysLeftOf, partLineOf, resetRoleOf } from './care-model';

const NOW = Date.UTC(2026, 9, 25);

function viewOf(life: number | null, left: number | null = null): ConsumableView {
  const [view] = consumablesOf({ vacuum_main_brush_life: life, vacuum_main_brush_left: left });
  if (view === undefined) {
    throw new Error('no view');
  }
  return view;
}

function forecastIn(days: number): LifeForecast {
  return { dailyUsePercent: 1, replaceAtMs: NOW + days * DAY_MS, line: [] };
}

describe('part line', () => {
  it('shows the value, days left and the forecast date as secondary text', () => {
    const line = partLineOf(viewOf(72, 299), forecastIn(41), NOW);
    expect(line).toStrictEqual({
      value: '72%',
      left: '41 days left',
      forecastDate: `by ${shortDate(NOW + 41 * DAY_MS)}`,
      status: null,
    });
  });

  it('falls back to the reported cleaning hours when there is no forecast', () => {
    const line = partLineOf(viewOf(72, 299), null, NOW);
    expect(line.left).toBe('about 299 h of cleaning');
    expect(line.forecastDate).toBeNull();
  });

  it('marks a low part with a warning and an empty one as worn out', () => {
    expect(partLineOf(viewOf(20), forecastIn(3), NOW).status).toStrictEqual({
      label: 'Replace soon',
      tone: 'warning',
    });
    const empty = partLineOf(viewOf(0), forecastIn(0), NOW);
    expect(empty).toMatchObject({
      value: '0%',
      left: 'Worn out',
      forecastDate: null,
      status: { label: 'Replace now', tone: 'critical' },
    });
  });

  it('says Unknown when only the time left is reported', () => {
    const line = partLineOf(viewOf(null, 40), null, NOW);
    expect(line.value).toBe('Unknown');
    expect(line.status).toBeNull();
  });

  it('counts whole days left and never below zero', () => {
    expect(daysLeftOf(forecastIn(1.2), NOW)).toBe(2);
    expect(daysLeftOf(forecastIn(-3), NOW)).toBe(0);
    expect(partLineOf(viewOf(40), forecastIn(1), NOW).left).toBe('1 day left');
    expect(partLineOf(viewOf(40), forecastIn(0), NOW).left).toBe('Due today');
  });
});

describe('care summary', () => {
  it('says all good, counts the soon ones and names the most urgent due part', () => {
    expect(careSummaryOf([viewOf(80)])).toMatchObject({ label: 'All good', tone: 'positive' });
    expect(careSummaryOf([viewOf(80), viewOf(20)])).toMatchObject({
      label: '1 to replace soon',
      tone: 'warning',
    });
    expect(careSummaryOf([viewOf(20), viewOf(5)])).toMatchObject({
      label: 'Main brush due',
      tone: 'critical',
    });
    expect(careSummaryOf([viewOf(80), viewOf(null, 4)])).toBeNull();
  });
});

describe('advice label', () => {
  it('says Good when nothing is due and names the urgent ones', () => {
    expect(adviceLabel(viewOf(80))).toBe('Good');
    expect(adviceLabel(viewOf(20))).toBe('Replace soon');
    expect(adviceLabel(viewOf(5))).toBe('Replace now');
  });
});

describe('reset offer', () => {
  it('offers no reset for the detergent, whose reset the plugin never calls', () => {
    const views = consumablesOf({
      vacuum_detergent_level: 50,
      vacuum_main_brush_life: 50,
      vacuum_roller_life: 50,
    });
    const roles = Object.fromEntries(views.map((view) => [view.part, resetRoleOf(view)]));
    expect(roles).toStrictEqual({
      detergent: null,
      main_brush: 'vacuum_reset_main_brush',
      roller_mop: 'vacuum_reset_roller',
    });
  });
});
