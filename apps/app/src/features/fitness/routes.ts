import type { PreloadContext, RouteDefinition } from '../../app-shell/route-types';
import { HEALTH_METRICS } from '@smarteverything/domain';
import { healthKeys, PRESENCE_DAYS, sightingsSince } from './data/queries';
import { readDailyFigures, readSightings } from './data/reads';
import { dayKeyOf, shiftDay } from '../../format/time';

const hasHealth = (availability: { readonly hasHealth: boolean }): boolean =>
  availability.hasHealth;

async function preloadToday({ queryClient }: PreloadContext): Promise<void> {
  const today = dayKeyOf(Date.now());
  const since = sightingsSince(today);
  await queryClient.query({
    queryKey: healthKeys.sightings(since),
    queryFn: () => readSightings(since),
  });
  const first = shiftDay(today, -PRESENCE_DAYS);
  const last = shiftDay(today, -30);
  await queryClient.query({
    queryKey: healthKeys.daily(first, last, HEALTH_METRICS),
    queryFn: () => readDailyFigures(first, last, HEALTH_METRICS),
  });
}

interface PageSpec {
  readonly key: string;
  readonly path: 'activity' | 'heart' | 'sleep' | 'body' | 'workouts' | 'vitals' | 'browse';
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
}

function page({ key, path, title, icon, keywords }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/fitness/${path}`,
    title,
    icon,
    tab: 'fitness',
    parent: 'fitness',
    keywords,
    available: hasHealth,
    preload: preloadToday,
    searchable: true,
  };
}

const START_WORKOUT: RouteDefinition = {
  key: 'fitness-start-workout',
  href: { pathname: '/fitness/workouts', params: { start: '1' } },
  title: 'Start workout',
  icon: 'play',
  tab: 'fitness',
  parent: 'fitness-workouts',
  keywords: ['start workout', 'exercise', 'treadmill', 'run', 'walk', 'watch workout'],
  available: (availability) => availability.hasHealth && availability.hasWatch,
  searchable: true,
};

export const ROUTES: readonly RouteDefinition[] = [
  page({
    key: 'fitness-activity',
    path: 'activity',
    title: 'Activity',
    icon: 'footprints',
    keywords: ['steps', 'calories', 'distance', 'move'],
  }),
  page({
    key: 'fitness-heart',
    path: 'heart',
    title: 'Heart',
    icon: 'heartPulse',
    keywords: ['heart rate', 'pulse', 'zones', 'bpm'],
  }),
  page({
    key: 'fitness-sleep',
    path: 'sleep',
    title: 'Sleep',
    icon: 'moon',
    keywords: ['sleep', 'bedtime', 'stages'],
  }),
  page({
    key: 'fitness-body',
    path: 'body',
    title: 'Body',
    icon: 'scale',
    keywords: ['weight', 'body fat', 'scale'],
  }),
  page({
    key: 'fitness-workouts',
    path: 'workouts',
    title: 'Workouts',
    icon: 'dumbbell',
    keywords: ['exercise', 'run', 'training'],
  }),
  page({
    key: 'fitness-vitals',
    path: 'vitals',
    title: 'Vitals',
    icon: 'breath',
    keywords: ['oxygen', 'spo2', 'breathing', 'temperature'],
  }),
  START_WORKOUT,
  page({
    key: 'fitness-browse',
    path: 'browse',
    title: 'All health data',
    icon: 'list',
    keywords: ['health data', 'metrics'],
  }),
];
