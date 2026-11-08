import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutList } from '../data/workout-list';
import { WorkoutsScreen } from './workouts-screen';

const state = vi.hoisted((): { list: WorkoutList; readonly none: () => null } => ({
  list: { workouts: [], loaded: false, error: null },
  none: (): null => null,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: (): Record<string, string> => ({}),
  useRouter: (): undefined => undefined,
}));
vi.mock('react-native', () => ({ View: state.none }));
vi.mock('../../../components/card', () => ({ Card: state.none }));
vi.mock('../../../components/section', () => ({ List: state.none }));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: Error }): ReactNode =>
    createElement('p', { role: 'alert' }, error.message),
}));
vi.mock('../../../components/skeleton', () => ({
  Skeleton: (props: { readonly shape: string; readonly className?: string }): ReactNode =>
    createElement('i', { 'data-skeleton': props.shape, className: props.className }),
}));
vi.mock('../components/fitness-frame', () => ({
  FitnessFrame: ({
    children,
    width,
  }: {
    readonly children: ReactNode;
    readonly width: string;
  }): ReactNode => createElement('main', { 'data-width': width }, children),
}));
vi.mock('../components/fitness-toolbar', () => ({ FitnessToolbar: state.none }));
vi.mock('../components/no-data-row', () => ({
  NoDataRow: ({ what }: { readonly what: string }): ReactNode =>
    createElement('p', {}, `No ${what} yet`),
}));
vi.mock('../components/stat-list', () => ({ StatList: state.none }));
vi.mock('../components/workout-row', () => ({ WorkoutRow: state.none }));
vi.mock('../components/detail-columns', () => ({ DetailColumns: state.none }));
vi.mock('../data/day', () => ({
  useFitnessParams: (): {
    readonly day: string;
    readonly today: string;
    readonly range: 'month';
  } => ({ day: '2026-11-05', today: '2026-11-05', range: 'month' }),
}));
vi.mock('../data/workout-list', () => ({ useWorkouts: (): WorkoutList => state.list }));
vi.mock('../model/workouts', () => ({
  personalRecords: (): [] => [],
  tempoText: (): string => '',
}));
vi.mock('../../watches', () => ({ useStartWorkout: (): Record<string, never> => ({}) }));

function render(list: WorkoutList): string {
  state.list = list;
  return renderToStaticMarkup(createElement(WorkoutsScreen));
}

describe('workouts list states', () => {
  it('shows the standard block placeholder on the first load', () => {
    const markup = render({ workouts: [], loaded: false, error: null });
    expect(markup).toContain('data-width="dashboard"');
    expect(markup).toContain('<i data-skeleton="block"></i>');
  });

  it.each([false, true])('shows only the error when the request fails (loaded: %s)', (loaded) => {
    const markup = render({
      workouts: [],
      loaded,
      error: new Error('Workouts unavailable'),
    });
    expect(markup).toContain('role="alert">Workouts unavailable');
    expect(markup).not.toContain('data-skeleton');
    expect(markup).not.toContain('No workouts');
  });

  it('replaces the placeholder with guidance once an empty list loads', () => {
    const markup = render({ workouts: [], loaded: true, error: null });
    expect(markup).toContain('No workouts in this period yet');
    expect(markup).not.toContain('data-skeleton');
  });
});
