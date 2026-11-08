import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { deviceFixture } from '../../../store/device-fixture';

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
}

const WAITING = vi.hoisted(() => 'Waiting for the printer…');

const seen = vi.hoisted(() => new Array<Seen>());
const world = vi.hoisted((): World => ({ face: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

const STATS = vi.hoisted(() => ({
  stats: {
    heatmap: [{ day: '2026-11-06', pages: 4, level: 2, covered: true }],
    weekdayHour: [],
    printing: { current: 2, longest: 5 },
    totals: { pages: 40, jobs: 6 },
  },
}));

vi.mock('react-native', () => ({ View: stub('View'), StyleSheet: { hairlineWidth: 1 } }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('Path') }));
vi.mock('../../../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/charts', () => ({
  CalendarHeatmap: stub('CalendarHeatmap'),
  HourHeatmap: stub('HourHeatmap'),
  TimeSeriesChart: stub('TimeSeriesChart'),
  WEEKDAY_ROWS: [],
}));
vi.mock('../../../components/loaded-query', () => ({
  LoadedQuery: ({ children }: { readonly children: (view: object) => ReactNode }): ReactNode =>
    children(STATS),
}));
vi.mock('../../../features/device-visuals', () => ({
  rounded: (): string => '',
  usePrinterLive: (): null => null,
}));
vi.mock('../../../store/clock', () => ({ useDayKey: (): string => '2026-11-06' }));
vi.mock('../components/printer-card', () => ({ WAITING }));
vi.mock('../components/supply-band', () => ({
  SupplyBars: stub('SupplyBars'),
  SupplyTanks: stub('SupplyTanks'),
}));
vi.mock('../data/use-printer-view', () => ({ usePrinterView: (): object => ({}) }));
vi.mock('../../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): World['face'] => world.face,
}));

const { ActivityFace } = await import('./activity-face');
const { SuppliesFace } = await import('./supplies-face');

function render(face: typeof ActivityFace, cls: FrameClass, width: number, height: number): void {
  seen.length = 0;
  world.face = { cls, frame: { width, height, idiom: 'touch' } };
  renderToStaticMarkup(createElement(face, { device: deviceFixture(0) }));
}

function plotRooms(): number {
  return seen.filter(
    (entry) =>
      entry.kind === 'View' &&
      entry.props['className'] === 'min-h-0 min-w-0 flex-1' &&
      typeof entry.props['onLayout'] === 'function',
  ).length;
}

function has(kind: string): boolean {
  return seen.some((entry) => entry.kind === kind);
}

describe('Printer activity widget', () => {
  it('fills the XL body with the daily pages strip above the calendar and hour maps', () => {
    render(ActivityFace, 'xl', 900, 324);
    expect(plotRooms()).toBe(1);
    expect(has('CalendarHeatmap')).toBe(true);
    expect(has('HourHeatmap')).toBe(true);
  });

  it('keeps the strip over the hour map on the phone XL', () => {
    render(ActivityFace, 'l', 348, 324);
    expect(plotRooms()).toBe(1);
    expect(has('CalendarHeatmap')).toBe(false);
    expect(has('HourHeatmap')).toBe(true);
  });

  it('shows only the strip at W', () => {
    render(ActivityFace, 'w', 700, 140);
    expect(plotRooms()).toBe(1);
    expect(has('HourHeatmap')).toBe(false);
  });
});

describe('Printer supplies widget', () => {
  it('says it is waiting for the printer instead of an empty body', () => {
    render(SuppliesFace, 'w', 700, 140);
    expect(seen.some((entry) => entry.kind === 'Text' && entry.props.children === WAITING)).toBe(
      true,
    );
    expect(has('SupplyBars')).toBe(false);
  });
});
