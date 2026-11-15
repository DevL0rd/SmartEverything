import { describe, expect, it } from 'vitest';
import type { FitnessDomain } from '../model/domains';
import { fitnessHrefOf, fitnessSectionsOf } from './fitness-sections';

const ids = (
  domains: ReadonlySet<FitnessDomain>,
  active: Parameters<typeof fitnessSectionsOf>[0],
): readonly string[] =>
  fitnessSectionsOf(active, domains).groups.flatMap((group) =>
    group.entries.map((entry) => entry.id),
  );

describe('fitness sections', () => {
  it('lists today, the domains with data, the open domain and nutrition', () => {
    expect(ids(new Set(['sleep', 'heart']), 'vitals')).toEqual([
      'today',
      'nutrition',
      'heart',
      'sleep',
      'vitals',
    ]);
  });

  it('links today to the fitness root and each domain to its page', () => {
    expect(fitnessHrefOf('today')).toBe('/fitness');
    expect(fitnessHrefOf('workouts')).toEqual({ pathname: '/fitness/workouts', params: {} });
  });

  it('replaces the open section from the rail', () => {
    expect(fitnessSectionsOf('today', new Set(['sleep'])).navigation).toBe('replace');
  });
});
