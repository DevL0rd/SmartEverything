import { TREADMILL_GOALS } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import type { StatsView } from '../model/today-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

interface World {
  face: { cls: FrameClass; frame: WidgetFrameBox } | null;
  view: StatsView | null;
}

const seen = vi.hoisted(() => new Array<Seen>());
const world = vi.hoisted((): World => ({ face: null, view: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), StyleSheet: { hairlineWidth: 1 } }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/charts', () => ({ Rings: stub('Rings') }));
vi.mock('../components/ghost-bars', () => ({ GhostBars: stub('GhostBars') }));
vi.mock('../data/treadmill-data', () => ({ useTreadmillView: (): object => ({}) }));
vi.mock('../../../components/loaded-query', () => ({
  LoadedQuery: ({ children }: { readonly children: (view: StatsView) => ReactNode }): ReactNode =>
    world.view === null ? null : children(world.view),
}));
vi.mock('../../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): World['face'] => world.face,
}));

const { ProgressFace } = await import('./progress-faces');

const TOTALS = {
  sessions: 3,
  activeSeconds: 3600,
  distanceM: 10000,
  steps: 12000,
  kcal: 400,
  climbM: 80,
  activeDays: 3,
};

function statsView(): StatsView {
  return {
    view: 'stats',
    profileId: null,
    stats: {
      range: 'week',
      from: '2026-10-12',
      to: '2026-10-18',
      buckets: [],
      previousBuckets: [],
      totals: TOTALS,
      previous: { ...TOTALS, climbM: 120 },
      delta: {
        sessions: null,
        activeSeconds: null,
        distanceM: null,
        steps: null,
        kcal: null,
        climbM: null,
      },
      average7: [],
      average30: [],
      incline: { avg: null, max: null, seconds: {} },
      perSession: { distanceM: 0, activeSeconds: 0, avgKmh: 0, steps: 0, kcal: 0, climbM: 0 },
      bests: {
        longestDistanceM: null,
        longestSeconds: null,
        fastestAvgKmh: null,
        topSpeedKmh: null,
        mostSteps: null,
        mostClimbM: null,
      },
      streak: { current: 2, longest: 5 },
      heatmap: [],
      zones: { walk: 0, jog: 0, run: 0 },
      efficiency: [],
    },
    goals: { ...TREADMILL_GOALS.parse({}), dailySteps: 8000, dailyKcal: 300 },
    today: { activeSeconds: 900, distanceM: 1200, steps: 1800, kcal: 60, sessions: 1 },
    week: { distanceM: 10000, sessions: 3 },
  };
}

function render(cls: FrameClass, width: number, height: number): void {
  seen.length = 0;
  world.face = { cls, frame: { width, height, idiom: 'touch' } };
  world.view = statsView();
  renderToStaticMarkup(createElement(ProgressFace, { deviceId: 'g15' }));
}

function ringSize(): unknown {
  return seen.find((entry) => entry.kind === 'Rings')?.props['size'];
}

function legendRows(): number {
  return seen.filter(
    (entry) => entry.kind === 'View' && typeof entry.props['accessibilityLabel'] === 'string',
  ).length;
}

function has(kind: string): boolean {
  return seen.some((entry) => entry.kind === kind);
}

describe('Treadmill goals widget', () => {
  beforeEach(() => {
    world.view = null;
  });

  it('sizes the rings to the M body height and keeps every legend row', () => {
    render('m', 348, 140);
    expect(ringSize()).toBe(88);
    expect(legendRows()).toBe(6);
    expect(has('GhostBars')).toBe(false);
  });

  it('adds the week bars beside the legend at W', () => {
    render('w', 700, 140);
    expect(ringSize()).toBe(88);
    expect(has('GhostBars')).toBe(true);
    expect(legendRows()).toBe(6);
  });

  it('stacks rings over bars at the phone XL and splits the body between them', () => {
    render('l', 348, 324);
    expect(ringSize()).toBe(130);
    expect(has('GhostBars')).toBe(true);
    expect(seen.some((entry) => entry.kind === 'Icon' && entry.props['name'] === 'flame')).toBe(
      true,
    );
  });

  it('scales the rings to the XL body height within a third of the width', () => {
    render('xl', 900, 324);
    expect(ringSize()).toBe(272);
    render('xl', 600, 324);
    expect(ringSize()).toBe(200);
  });
});
