import { describe, expect, it } from 'vitest';
import type { VacuumCleanSummary } from '@smarteverything/domain';
import { batteryUsedBars, bucketLabelOf } from './history-charts';
import { cleansIn } from './history-stats';
import { periodAt } from '../model/stats-period';

function clean(
  id: string,
  when: Date,
  extra: Partial<VacuumCleanSummary> = {},
): VacuumCleanSummary {
  return {
    id,
    startedAt: when.toISOString(),
    endedAt: null,
    seconds: 1800,
    areaM2: 30,
    scope: 'global',
    mode: 'sweep',
    rooms: [],
    outcome: 'finished',
    batteryStart: 100,
    batteryEnd: 70,
    ...extra,
  };
}

describe('history helpers', () => {
  it('keeps only cleans that started inside the period', () => {
    const period = periodAt('month', new Date(2026, 9, 10).getTime());
    const inside = clean('a', new Date(2026, 9, 3, 9));
    const before = clean('b', new Date(2026, 8, 30, 23));
    const after = clean('c', new Date(2026, 10, 1, 0, 0, 1));
    expect(cleansIn([inside, before, after], period)).toStrictEqual([inside]);
  });

  it('draws battery used oldest first and skips cleans without both readings', () => {
    const later = clean('later', new Date(2026, 9, 5), { batteryStart: 90, batteryEnd: 40 });
    const earlier = clean('earlier', new Date(2026, 9, 2));
    const unknown = clean('unknown', new Date(2026, 9, 3), { batteryEnd: null });
    const charged = clean('charged', new Date(2026, 9, 4), { batteryStart: 50, batteryEnd: 60 });
    expect(batteryUsedBars([later, unknown, charged, earlier])).toStrictEqual([
      { key: 'earlier', value: 30, label: '2' },
      { key: 'charged', value: 0, label: '4' },
      { key: 'later', value: 50, label: '5' },
    ]);
  });

  it('labels buckets by weekday, day of month or month', () => {
    const start = new Date(2026, 9, 19).getTime();
    expect(bucketLabelOf('month', start)).toBe('19');
    expect(bucketLabelOf('week', start)).toHaveLength(3);
    expect(bucketLabelOf('year', start)).toHaveLength(3);
  });
});

describe('history modules', () => {
  it('load without a browser or a device', async () => {
    const history = await import('./history');
    const replay = await import('../components/clean-replay');
    expect(typeof history.VacuumHistory).toBe('function');
    expect(typeof replay.CleanReplay).toBe('function');
  });
});
