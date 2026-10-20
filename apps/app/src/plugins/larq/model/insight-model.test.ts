import { describe, expect, it } from 'vitest';
import { insightsOf } from './insight-model';
import { statsOf, statusOf } from './fixtures';

const AFTERNOON = 15 * 60;

describe('insight chips', () => {
  it('says how far ahead or behind the expected pace the day is', () => {
    const behind = insightsOf(statusOf(), undefined, AFTERNOON);
    expect(behind[0]).toMatchObject({ key: 'pace', tone: 'warning', icon: 'trendDown' });
    expect(behind[0]?.label).toContain('behind pace');
    const base = statusOf();
    const ahead = insightsOf(
      statusOf({ today: { ...base.today, totalMl: 2500 } }),
      undefined,
      AFTERNOON,
    );
    expect(ahead[0]).toMatchObject({ tone: 'positive', icon: 'trendUp' });
  });

  it('says nothing while the first sync is still reading the history', () => {
    expect(insightsOf(statusOf({ firstSyncPending: true }), statsOf(), AFTERNOON)).toStrictEqual(
      [],
    );
  });

  it('says nothing about pace before the day starts', () => {
    expect(insightsOf(statusOf(), undefined, 60)).toStrictEqual([]);
  });

  it('adds the best day of the month and the streak once the stats are in', () => {
    const keys = insightsOf(statusOf(), statsOf(), AFTERNOON).map((insight) => insight.key);
    expect(keys).toStrictEqual(['pace', 'best-day', 'streak']);
  });

  it('celebrates today when it is the best day so far this month', () => {
    const stats = statsOf();
    const heatmap = stats.heatmap.map((entry) =>
      entry.day.startsWith('2026-10')
        ? { ...entry, ml: entry.day === stats.today ? 3000 : 100 }
        : entry,
    );
    const best = insightsOf(statusOf(), statsOf({ heatmap }), AFTERNOON).find(
      (insight) => insight.key === 'best-day',
    );
    expect(best?.label).toBe('Today is your best day this month');
  });

  it('leaves out the best day when nothing was drunk this month', () => {
    const stats = statsOf();
    const heatmap = stats.heatmap.map((entry) => ({ ...entry, ml: 0 }));
    const keys = insightsOf(
      statusOf(),
      statsOf({ heatmap, streak: { ...stats.streak, current: 0 } }),
      AFTERNOON,
    ).map((insight) => insight.key);
    expect(keys).toStrictEqual(['pace']);
  });
});
