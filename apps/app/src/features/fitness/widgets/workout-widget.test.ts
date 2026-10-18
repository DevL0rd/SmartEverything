import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Read {
  readonly workout: unknown;
  readonly loaded: boolean;
  readonly error: null;
}

interface State {
  read: Read;
  width: number;
  readonly empties: Record<string, unknown>[];
  readonly stats: unknown[];
}

const state = vi.hoisted((): State => ({
  read: { workout: null, loaded: true, error: null },
  width: 326,
  empties: [],
  stats: [],
}));

vi.mock('../../../app-shell/hrefs', () => ({ href: { workout: (id: string): string => id } }));
vi.mock('../../../components/icon-well', () => ({ IconWell: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/widget-board', () => ({
  WidgetFrame: ({ children }: { readonly children: unknown }): unknown => children,
  WidgetEmpty: (props: Record<string, unknown>): null => {
    state.empties.push(props);
    return null;
  },
}));
vi.mock('../../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): unknown => ({
    cls: 'm',
    frame: { width: state.width, height: 140, idiom: 'touch' },
  }),
}));
vi.mock('../data/today', () => ({ useTodayContext: (): unknown => ({ day: '2026-10-10' }) }));
vi.mock('../data/workouts', () => ({ useLatestWorkout: (): unknown => state.read }));
vi.mock('../../health-log', () => ({ exerciseKindOf: (): unknown => ({ icon: 'dumbbell' }) }));
vi.mock('../model/workout-facts', () => ({
  workoutFacts: (): unknown => [
    { label: 'Time', text: '30 min' },
    { label: 'Distance', text: '5 km' },
    { label: 'Energy', text: '300 kcal' },
    { label: 'Heart', text: '120 bpm' },
  ],
}));
vi.mock('../components/glance-parts', () => ({
  QuickStats: ({ stats }: { readonly stats: readonly unknown[] }): null => {
    state.stats.push(stats);
    return null;
  },
}));

const { WorkoutWidget } = await import('./workout-widget');

function render(): void {
  renderToStaticMarkup(createElement(WorkoutWidget));
}

describe('WorkoutWidget', () => {
  beforeEach(() => {
    state.empties.length = 0;
    state.stats.length = 0;
    state.width = 326;
  });

  it('shows an empty state when there is no workout in the last 30 days', () => {
    state.read = { workout: null, loaded: true, error: null };
    render();
    expect(state.empties).toHaveLength(1);
    expect(state.empties[0]).toMatchObject({
      title: 'No workouts in the last 30 days',
      icon: 'dumbbell',
    });
  });

  it('shows nothing while the workouts are still loading', () => {
    state.read = { workout: null, loaded: false, error: null };
    render();
    expect(state.empties).toHaveLength(0);
  });

  const LATEST = {
    workout: { recordId: 'r1', code: 1, name: 'Run', title: null, start: 0 },
    loaded: true,
    error: null,
  };

  it('shows the latest workout facts, four on a frame at least 300 wide', () => {
    state.read = LATEST;
    render();
    expect(state.empties).toHaveLength(0);
    expect(state.stats[0]).toHaveLength(4);
  });

  it('shows three facts on a phone-width frame', () => {
    state.read = LATEST;
    state.width = 244;
    render();
    expect(state.stats[0]).toHaveLength(3);
  });
});
