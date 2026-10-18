import type { RouteDefinition } from '../../app-shell/route-types';
import {
  preloadActivity,
  preloadBody,
  preloadBrowse,
  preloadHeart,
  preloadSleep,
  preloadVitals,
  preloadWorkouts,
} from './data/preload';

const hasHealth = (availability: { readonly hasHealth: boolean }): boolean =>
  availability.hasHealth;

interface PageSpec {
  readonly key: string;
  readonly path: 'activity' | 'heart' | 'sleep' | 'body' | 'workouts' | 'vitals' | 'browse';
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
  readonly preload: NonNullable<RouteDefinition['preload']>;
}

function page({ key, path, title, icon, keywords, preload }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/fitness/${path}`,
    title,
    icon,
    tab: 'fitness',
    parent: 'fitness',
    keywords,
    available: hasHealth,
    preload,
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
  preload: preloadWorkouts,
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
    preload: preloadActivity,
  }),
  page({
    key: 'fitness-heart',
    path: 'heart',
    title: 'Heart',
    icon: 'heartPulse',
    keywords: ['heart rate', 'pulse', 'zones', 'bpm'],
    preload: preloadHeart,
  }),
  page({
    key: 'fitness-sleep',
    path: 'sleep',
    title: 'Sleep',
    icon: 'moon',
    keywords: ['sleep', 'bedtime', 'stages'],
    preload: preloadSleep,
  }),
  page({
    key: 'fitness-body',
    path: 'body',
    title: 'Body',
    icon: 'scale',
    keywords: ['weight', 'body fat', 'scale'],
    preload: preloadBody,
  }),
  page({
    key: 'fitness-workouts',
    path: 'workouts',
    title: 'Workouts',
    icon: 'dumbbell',
    keywords: ['exercise', 'run', 'training'],
    preload: preloadWorkouts,
  }),
  page({
    key: 'fitness-vitals',
    path: 'vitals',
    title: 'Vitals',
    icon: 'breath',
    keywords: ['oxygen', 'spo2', 'breathing', 'temperature'],
    preload: preloadVitals,
  }),
  START_WORKOUT,
  page({
    key: 'fitness-browse',
    path: 'browse',
    title: 'All health data',
    icon: 'list',
    keywords: ['health data', 'metrics'],
    preload: preloadBrowse,
  }),
];
