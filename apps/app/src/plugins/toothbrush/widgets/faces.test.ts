import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { viewOf } from '../model/fixtures';

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

const seen = vi.hoisted(() => new Array<Seen>());
const world = vi.hoisted((): World => ({ face: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), StyleSheet: { hairlineWidth: 1 } }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../components/figure', () => ({ Figure: stub('Figure') }));
vi.mock('../../../components/charts', () => ({ Rings: stub('Rings') }));
vi.mock('../charts/session-bars', () => ({ SessionBarsChart: stub('SessionBarsChart') }));
vi.mock('../charts/trend-chart', () => ({ TrendChart: stub('TrendChart') }));
vi.mock('../data/brush-data', () => ({ useBrushView: (): object => ({ data: undefined }) }));
vi.mock('../../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): World['face'] => world.face,
}));

const { TodayFace } = await import('./today-face');
const { StatsFace } = await import('./stats-face');

function render(face: typeof TodayFace, cls: FrameClass, width: number, height: number): void {
  seen.length = 0;
  world.face = { cls, frame: { width, height, idiom: 'touch' } };
  const view = viewOf();
  renderToStaticMarkup(createElement(face, { deviceId: view.deviceId, view }));
}

function texts(): readonly string[] {
  return seen.flatMap((entry) =>
    entry.kind === 'Text' && typeof entry.props.children === 'string' ? [entry.props.children] : [],
  );
}

function inlineSummary(): boolean {
  return seen.some(
    (entry) =>
      entry.kind === 'View' &&
      typeof entry.props['className'] === 'string' &&
      entry.props['className'].includes('flex-row items-center gap-4'),
  );
}

describe('Brushing today widget', () => {
  it('keeps the streak beside the legend at M', () => {
    render(TodayFace, 'm', 348, 140);
    expect(seen.some((entry) => entry.kind === 'Icon' && entry.props['name'] === 'flame')).toBe(
      true,
    );
    expect(texts()).toContain('3 days in a row');
  });

  it('lets each legend label wrap to a second line', () => {
    render(TodayFace, 'm', 348, 140);
    const legend = seen.filter(
      (entry) =>
        entry.kind === 'Text' &&
        typeof entry.props.children === 'string' &&
        entry.props.children.startsWith('Brushes'),
    );
    expect(legend.map((entry) => entry.props['numberOfLines'])).toEqual([2]);
  });
});

describe('Brushing score widget', () => {
  it('puts the score beside its badge at W so the summary fits the M body height', () => {
    render(StatsFace, 'w', 700, 140);
    expect(inlineSummary()).toBe(true);
  });

  it('stacks the score over its badge at XL', () => {
    render(StatsFace, 'xl', 900, 324);
    expect(inlineSummary()).toBe(false);
  });
});
