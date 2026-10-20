import { describe, expect, it } from 'vitest';
import {
  batteryScaleOf,
  chargeLine,
  dischargeSeries,
  filterRingsOf,
  freshnessOf,
  modeTotals,
} from './care-model';
import { NOW, careOf } from './fixtures';

describe('clean freshness', () => {
  it('is fresh just after a clean and names the next self-clean from the last one', () => {
    const care = careOf({
      uvRecent: [
        { at: '2026-10-18T15:20:00+02:00', mode: 'maintenance', socPct: 82 },
        { at: '2026-10-18T09:00:00+02:00', mode: 'normal', socPct: 84 },
      ],
    });
    const state = freshnessOf(care, NOW);
    expect(state).toMatchObject({ label: 'Fresh', fresh: true });
    expect(state.next).toMatch(/^Next self-clean about /);
  });

  it('is not recent after a long gap and has no next self-clean', () => {
    const state = freshnessOf(careOf(), NOW);
    expect(state.label).toBe('Not recent');
    expect(state.next).toBeNull();
  });

  it('says never cleaned without any cycle', () => {
    expect(freshnessOf(careOf({ uvRecent: [] }), NOW).label).toBe('Never cleaned');
  });
});

describe('care figures', () => {
  it('shares the cycles of the month between the modes', () => {
    const totals = modeTotals(careOf());
    expect(totals.map((total) => total.mode)).toEqual(['normal', 'adventure', 'maintenance']);
    expect(totals.reduce((sum, total) => sum + total.share, 0)).toBeCloseTo(1);
  });

  it('has zero shares when nothing ran', () => {
    const quiet = careOf({
      uvDays: [{ day: '2026-10-18', maintenance: 0, normal: 0, adventure: 0 }],
    });
    expect(modeTotals(quiet).every((total) => total.share === 0)).toBe(true);
  });

  it('words the battery and its ticks', () => {
    const scale = batteryScaleOf(careOf().battery);
    expect(scale).toMatchObject({ pct: 82, alert: 20, lockout: 10 });
    expect(scale.line).toBe('Battery 82%, about 23 days left');
    expect(batteryScaleOf({ ...careOf().battery, pct: null }).line).toBe('Battery unknown');
    expect(batteryScaleOf({ ...careOf().battery, daysLeft: null }).line).toBe('Battery 82%');
  });

  it('turns battery rows into a line and a charge into words', () => {
    const { battery } = careOf();
    expect(dischargeSeries(battery.points)).toHaveLength(12);
    expect(battery.charges.map(chargeLine)[0]).toMatch(/\+40% in 2\.2 h$/);
  });

  it('compares the filter with both limits', () => {
    const filter = careOf().filter;
    if (filter === null) {
      throw new Error('the fixture has a filter');
    }
    const rings = filterRingsOf(filter);
    expect(rings.litres).toBeCloseTo(21 / 94);
    expect(rings.days).toBeCloseTo(28 / 60);
    expect(rings.litresText).toBe('21 of 94 L');
    expect(rings.daysText).toBe('28 of 60 days');
    expect(rings.due).toBe(false);
    expect(filterRingsOf({ ...filter, litresUsed: 120, replaceBy: null }).litres).toBe(1);
  });
});
