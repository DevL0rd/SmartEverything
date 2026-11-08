import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface State {
  totals: Record<string, number>;
  cls: string;
  idiom: 'touch' | 'pointer';
  height: number;
  controlH: number;
  readonly figures: string[];
  readonly glasses: string[];
  readonly dials: string[];
}

const state = vi.hoisted((): State => ({
  totals: {},
  cls: 'm',
  idiom: 'touch',
  height: 140,
  controlH: 48,
  figures: [],
  glasses: [],
  dials: [],
}));

const HEADER = { touch: 40, pointer: 32 } as const;

vi.mock('../../../app-shell/hrefs', () => ({
  href: { fitnessPage: (): string => '/fitness', logFood: (): string => '/log' },
}));
vi.mock('../../../components/charts', () => ({
  Rings: (): ReactNode => createElement('svg', null, 'rings'),
  ProgressBar: (): ReactNode => createElement('progress'),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('../../../components/figure', () => ({
  Figure: ({ size }: { readonly size: string }): ReactNode => {
    state.figures.push(size);
    return createElement('b', null, 'figure');
  },
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('p', null, children),
}));
vi.mock('../../../components/widget-board', () => ({
  WidgetFrame: ({
    children,
    actions,
  }: {
    readonly children: ReactNode;
    readonly actions?: ReactNode;
  }): ReactNode =>
    createElement(
      'article',
      null,
      createElement('main', null, children),
      actions === undefined ? null : createElement('footer', null, actions),
    ),
  ActionBand: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('footer', null, children),
  widgetBodyHeight: ({
    height,
    idiom,
  }: {
    readonly height: number;
    readonly idiom: 'touch' | 'pointer';
  }): number => height - 0.67 - HEADER[idiom] - 12,
}));
vi.mock('../../../components/widget-board/use-widget-face', () => ({
  useWidgetFace: (): unknown => ({
    cls: state.cls,
    frame: { width: 326, height: state.height, idiom: state.idiom },
    sizes: { controlH: state.controlH },
  }),
}));
vi.mock('../components/calorie-dial', () => ({
  CalorieDial: ({ size }: { readonly size: string }): ReactNode => {
    state.dials.push(size);
    return createElement('svg', null, 'dial');
  },
}));
vi.mock('../components/glass-icon', () => ({
  GlassIcon: (): ReactNode => createElement('button', null, 'glass icon'),
}));
vi.mock('../components/water-glass', () => ({
  WaterGlass: ({ size }: { readonly size: string }): ReactNode => {
    state.glasses.push(size);
    return createElement('i', null, 'glass');
  },
}));
vi.mock('../components/water-row', () => ({
  GlassButton: (): ReactNode => createElement('button', null, 'glass button'),
}));
vi.mock('../data/prefs', () => ({
  useNutritionPrefs: (): unknown => ({
    energyKcal: 2000,
    proteinG: 120,
    carbohydrateG: 250,
    fatG: 70,
    glassMl: 250,
  }),
}));
vi.mock('../data/totals', () => ({ useDayTotals: (): unknown => state.totals }));
vi.mock('../data/water-goal', () => ({
  useWaterGoal: (): unknown => ({ ml: 2000, chosen: true }),
}));

const { CaloriesWidget, MacrosWidget, WaterWidget } = await import('./nutrition-widgets');

const DAY = { size: 'M', day: '2026-11-07', today: '2026-11-07' } as const;

function render(widget: (props: typeof DAY) => ReactNode): string {
  return renderToStaticMarkup(createElement(widget, DAY));
}

function footerOf(markup: string): string {
  return /<footer>(.*)<\/footer>/.exec(markup)?.[1] ?? '';
}

describe('nutrition widgets', () => {
  beforeEach(() => {
    state.totals = {};
    state.cls = 'm';
    state.idiom = 'touch';
    state.height = 140;
    state.controlH = 48;
    state.figures.length = 0;
    state.glasses.length = 0;
    state.dials.length = 0;
  });

  it('puts Add food in the action band of an empty Macros widget', () => {
    const markup = render(MacrosWidget);
    expect(footerOf(markup)).toBe('<button>Add food</button>');
    expect(markup).toContain('Nothing logged yet');
  });

  it('keeps Add food in a tile instead of dropping it', () => {
    state.cls = 's';
    expect(footerOf(render(MacrosWidget))).toBe('<button>Add food</button>');
  });

  it('shows the three macros without a band once food is logged', () => {
    state.totals = { protein: 40, carbohydrate: 120, fat: 30 };
    const markup = render(MacrosWidget);
    expect(markup).not.toContain('<footer>');
    expect(markup).toContain('Protein');
    expect(markup).toContain('Carbs');
    expect(markup).toContain('Fat');
  });

  it('puts the glass control in the band beside the glass art, never under it', () => {
    state.totals = { hydration: 1.25 };
    const markup = render(WaterWidget);
    expect(footerOf(markup)).toContain('glass');
    expect(markup).toMatch(/<i>glass<\/i><\/div><div[^>]*>.*<footer>/);
  });

  it('fits the water figure and glass to the room left above the band', () => {
    render(WaterWidget);
    expect(state.figures).toEqual(['m']);
    expect(state.glasses).toEqual(['l']);
  });

  it('grows the water figure when compact density leaves room for it', () => {
    state.height = 144;
    state.controlH = 44;
    render(WaterWidget);
    expect(state.figures).toEqual(['l']);
  });

  it('uses the smaller glass on pointer so it stays inside the body', () => {
    state.idiom = 'pointer';
    state.height = 120;
    state.controlH = 36;
    render(WaterWidget);
    expect(state.glasses).toEqual(['m']);
    expect(state.figures).toEqual(['m']);
  });

  it('keeps the calorie dial at the size that fits a two-row body on wide frames', () => {
    state.cls = 'w';
    render(CaloriesWidget);
    expect(state.dials).toEqual(['xs']);
  });
});
