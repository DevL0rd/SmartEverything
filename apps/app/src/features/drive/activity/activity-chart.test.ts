import { describe, expect, it, vi } from 'vitest';
import type { ActivityColumn, ActivitySeries } from './via-model';

vi.mock('react-native', () => ({ View: (): null => null }));
vi.mock('react-native-reanimated', () => ({
  default: { View: (): null => null },
  useAnimatedStyle: (): object => ({}),
}));
vi.mock('react-native-svg', () => ({ default: (): null => null, Line: (): null => null }));
vi.mock('../../../components/card', () => ({ Card: (): null => null }));
vi.mock('../../../components/charts/bar-marks', () => ({
  BarLabels: (): null => null,
  BarMarks: (): null => null,
}));
vi.mock('../../../components/charts/chart-legend', () => ({ ChartLegend: (): null => null }));
vi.mock('../../../components/charts/empty-graph', () => ({ EmptyGraph: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/use-draw', () => ({ useDraw: (): null => null }));
vi.mock('../../../components/use-measured-width', () => ({ useMeasuredWidth: (): null => null }));
vi.mock('../../../design/colour', () => ({
  useColour: (): string => '#000',
  useColourResolver: (): ((role: string) => string) => (role) => role,
}));
vi.mock('../../../design/motion', () => ({ useMotion: (): object => ({ reduced: false }) }));

const { stackShapes } = await import('./activity-chart');

const FILLS = {
  you: 'you',
  people: 'people',
  ai: 'ai',
  automation: 'automation',
  background: 'background',
  outside: 'outside',
};

function column(key: string, counts: Partial<Record<ActivitySeries, number>>): ActivityColumn {
  const full = { you: 0, people: 0, ai: 0, automation: 0, background: 0, outside: 0, ...counts };
  const total = Object.values(full).reduce((sum, value) => sum + value, 0);
  return { key, label: key, when: key, spoken: key, counts: full, total };
}

describe('activity chart stacks', () => {
  it('stacks the series bottom up in the fixed order and rounds only the top segment', () => {
    const shapes = stackShapes([column('a', { outside: 2, you: 3, ai: 1 })], 300, FILLS);
    expect(shapes.map((shape) => shape.fill)).toEqual(['you', 'ai', 'outside']);
    expect(shapes.map((shape) => shape.radii.top)).toEqual([0, 0, 3]);
    const [first, second] = shapes;
    expect(first?.bottom).toBe(149);
    expect(second?.bottom).toBe((first?.top ?? 0) - 2);
  });

  it('fits the tallest column, gaps included, inside the plot', () => {
    const shapes = stackShapes(
      [column('a', { you: 4, people: 4, ai: 4 }), column('b', { you: 1 })],
      300,
      FILLS,
    );
    const top = Math.min(...shapes.map((shape) => shape.top));
    expect(top).toBeCloseTo(0, 6);
    expect(shapes.filter((shape) => shape.key.startsWith('b-'))).toHaveLength(1);
  });

  it('draws nothing for an empty day', () => {
    expect(stackShapes([column('a', {})], 300, FILLS)).toEqual([]);
  });
});
