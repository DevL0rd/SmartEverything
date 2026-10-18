import { describe, expect, it } from 'vitest';
import type { HealthDailyRow, HealthMetric } from '@smarteverything/domain';
import { fitnessDayOf } from './fitness-today';

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

function row(
  day: string,
  metric: HealthMetric,
  value: number,
  profile: string | null = ME,
): HealthDailyRow {
  return { profile_id: profile, day, metric, value, unit: 'x', updated_at: `${day}T20:00:00.000Z` };
}

describe('the fitness figures on Home', () => {
  it('is empty without any tracked reading for the person', () => {
    expect(fitnessDayOf([], '2026-10-16', ME)).toBeNull();
    expect(fitnessDayOf([row('2026-10-16', 'steps', 900, OTHER)], '2026-10-16', ME)).toBeNull();
    expect(fitnessDayOf([row('2026-10-16', 'vitality', 3)], '2026-10-16', ME)).toBeNull();
  });

  it('shows the latest day up to today, never a future day', () => {
    const rows = [
      row('2026-10-14', 'steps', 1000),
      row('2026-10-15', 'steps', 2500),
      row('2026-10-17', 'steps', 9999),
    ];
    expect(fitnessDayOf(rows, '2026-10-16', ME)?.day).toBe('2026-10-15');
  });

  it('formats steps, move and exercise and drops distance past the third figure', () => {
    const day = fitnessDayOf(
      [
        row('2026-10-16', 'distance', 4200),
        row('2026-10-16', 'exercise', 31.4),
        row('2026-10-16', 'active_energy', 512.6),
        row('2026-10-16', 'steps', 8421),
      ],
      '2026-10-16',
      ME,
    );
    expect(day?.figures.map((figure) => figure.key)).toEqual([
      'steps',
      'active_energy',
      'exercise',
    ]);
    expect(day?.figures.map((figure) => figure.value)).toEqual(['8,421', '513', '31']);
    expect(day?.figures.map((figure) => figure.unit)).toEqual(['', 'kcal', 'min']);
  });

  it('shows distance in kilometres when it is among the first three', () => {
    const day = fitnessDayOf([row('2026-10-16', 'distance', 4250)], '2026-10-16', ME);
    expect(day?.figures).toEqual([
      { key: 'distance', label: 'Distance', value: '4.3', unit: 'km' },
    ]);
  });

  it('counts home-wide rows and the person own rows but not another person', () => {
    const rows = [
      row('2026-10-16', 'steps', 100, null),
      row('2026-10-16', 'exercise', 20, OTHER),
      row('2026-10-16', 'active_energy', 300, ME),
    ];
    expect(fitnessDayOf(rows, '2026-10-16', ME)?.figures.map((figure) => figure.key)).toEqual([
      'steps',
      'active_energy',
    ]);
  });

  it('only lists figures recorded on the chosen day', () => {
    const rows = [row('2026-10-15', 'steps', 5000), row('2026-10-16', 'exercise', 10)];
    const day = fitnessDayOf(rows, '2026-10-16', ME);
    expect(day?.figures.map((figure) => figure.key)).toEqual(['exercise']);
  });
});
