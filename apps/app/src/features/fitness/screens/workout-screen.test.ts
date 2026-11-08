import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { WorkoutDetail } from '../data/workout';
import type { Workout } from '../model/workouts';
import { WorkoutScreen } from './workout-screen';

const layout = vi.hoisted(() => ({ width: 380, header: 'large', hasRoute: true }));

const customTitle = 'A long custom workout name that needs room to wrap on a phone';

const workout: Workout = {
  recordId: 'fixture-workout',
  code: 56,
  name: 'Running',
  title: customTitle,
  notes: null,
  start: Date.UTC(2026, 10, 6, 8),
  end: Date.UTC(2026, 10, 6, 9),
  minutes: 60,
  meters: null,
  kilocalories: null,
  heart: [],
  averageBpm: null,
  maxBpm: null,
  secondsPerKm: null,
  route: { status: 'consent_required' },
  laps: 0,
  source: 'com.strava',
};

interface Children {
  readonly children: ReactNode;
}

vi.mock('expo-router', () => ({
  useLocalSearchParams: (): { workoutId: string } => ({ workoutId: workout.recordId }),
}));
vi.mock('react-native', () => ({
  View: ({ className, children }: Children & { readonly className: string }): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { header: string } => ({ header: layout.header }),
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: layout.width,
    onLayout: (): void => undefined,
  }),
}));
vi.mock('../../../components/screen', () => ({
  Screen: ({
    children,
    header,
    maxWidth,
  }: Children & { readonly header: ReactNode; readonly maxWidth?: string }): ReactNode =>
    createElement('main', { 'data-width': maxWidth }, header, children),
}));
vi.mock('../../../components/page-header', () => ({
  PageHeader: ({ title }: { readonly title: string }): ReactNode =>
    createElement('h1', null, title),
}));
vi.mock('../../../components/card', () => ({
  Card: ({ children, title }: Children & { readonly title?: string }): ReactNode =>
    createElement(
      'section',
      null,
      title === undefined ? null : createElement('h2', null, title),
      children,
    ),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Children): ReactNode => createElement('p', null, children),
}));
vi.mock('../../../components/figure', () => ({
  Figure: ({ value }: { readonly value: string }): ReactNode =>
    createElement('strong', null, value),
}));
vi.mock('../../../components/charts', () => ({ Sparkline: (): null => null }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../components/detail-columns', () => ({
  DetailColumns: ({
    main,
    side,
  }: {
    readonly main: ReactNode;
    readonly side: ReactNode;
  }): ReactNode => createElement('div', null, main, side),
}));
vi.mock('../components/route-map', () => ({ RouteMap: (): null => null }));
vi.mock('../components/stat-list', () => ({ StatList: (): null => null }));
vi.mock('../components/workout-row', () => ({ WorkoutIcon: (): null => null }));
vi.mock('../model/workout-facts', () => ({ workoutFacts: (): [] => [] }));
vi.mock('../model/sources', () => ({ appName: (): string => 'Strava' }));
vi.mock('../data/day', () => ({ useToday: (): string => '2026-11-06' }));
vi.mock('../data/workout', () => ({
  useWorkoutDetail: (): WorkoutDetail => ({
    status: 'ready',
    workout: { ...workout, route: layout.hasRoute ? workout.route : { status: 'absent' } },
  }),
}));

it('wraps the custom name on phones and splits optional details only when the pane can fit them', () => {
  const phone = renderToStaticMarkup(createElement(WorkoutScreen));
  expect(phone).toContain('<main><h1>Running</h1>');
  expect(phone).toContain(`<h2>${customTitle}</h2>`);
  expect(phone).not.toContain('gap-section-gap flex-row');

  Object.assign(layout, { width: 1112, header: 'desktop' });
  const desktop = renderToStaticMarkup(createElement(WorkoutScreen));
  expect(desktop).toContain(`<main><h1>${customTitle}</h1>`);
  expect(desktop).toContain('gap-section-gap flex-row items-start');
  expect(desktop).toContain('Open this workout on your phone to share its route.');

  layout.hasRoute = false;
  const summary = renderToStaticMarkup(createElement(WorkoutScreen));
  expect(summary).not.toContain('gap-section-gap flex-row');
  expect(summary).not.toContain('<h2>Route</h2>');
});
