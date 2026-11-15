import { describe, expect, it } from 'vitest';
import { phoneTabsOf, sectionsPullUp } from '../../../components/page-shell/shell-sections';
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

  it('replaces the open section from the rail and the phone tabs', () => {
    const sections = fitnessSectionsOf('today', new Set(['sleep']));
    expect(sections.navigation).toBe('replace');
    expect(phoneTabsOf(sections)?.items.map((item) => item.navigation)).toEqual([
      'replace',
      'replace',
      'replace',
    ]);
  });

  it('shows every section as a phone tab while the list is short', () => {
    const sections = fitnessSectionsOf('today', new Set(['sleep']));
    expect(sectionsPullUp(sections)).toBe(false);
    expect(phoneTabsOf(sections)?.items.map((item) => item.key)).toEqual([
      'today',
      'nutrition',
      'sleep',
    ]);
  });

  it('keeps the pinned tabs and the open section on the phone once the list is long', () => {
    const all = new Set<FitnessDomain>([
      'activity',
      'heart',
      'sleep',
      'body',
      'workouts',
      'vitals',
    ]);
    const sections = fitnessSectionsOf('vitals', all);
    expect(sectionsPullUp(sections)).toBe(true);
    expect(phoneTabsOf(sections)?.items.map((item) => item.key)).toEqual([
      'today',
      'activity',
      'nutrition',
      'heart',
      'sleep',
      'vitals',
    ]);
  });
});
