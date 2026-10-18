import { FITNESS_DOMAINS, type FitnessDomain } from './domains';

export type FitnessTab = 'today' | FitnessDomain;

const FITNESS_TABS: readonly FitnessTab[] = ['today', ...FITNESS_DOMAINS];

export function sectionRouteOf(tab: FitnessTab): string {
  if (tab === 'today') return 'index';
  return tab === 'workouts' ? 'workouts/index' : tab;
}

export const FITNESS_SECTION_ROUTES: readonly string[] = FITNESS_TABS.map(sectionRouteOf);
