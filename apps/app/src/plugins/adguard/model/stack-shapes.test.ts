import { describe, expect, it } from 'vitest';
import { hourlyStack } from './chart-model';
import { statsFixture } from './snapshot-fixture';
import { stackShapes, type StackLayout } from './stack-shapes';

const NOW = new Date(2026, 9, 17, 13, 30).toISOString();
const COLOURS = { allowed: '#aaa', blocked: '#bbb' } as const;

function shapesFor(
  history: number[],
  blocked: number[],
  selected: number | null = null,
): ReturnType<typeof stackShapes> {
  const bars = hourlyStack(statsFixture({ history, historyBlocked: blocked }), NOW);
  const layout: StackLayout = { ceiling: 100, width: 240, height: 100, colours: COLOURS, selected };
  return stackShapes(bars, layout);
}

describe('stackShapes', () => {
  it('anchors blocked on the baseline and puts allowed above it with a 2 px gap', () => {
    const shapes = shapesFor([100], [40]);
    const blocked = shapes.find((shape) => shape.fill === COLOURS.blocked);
    const allowed = shapes.find((shape) => shape.fill === COLOURS.allowed);
    expect(blocked).toMatchObject({ top: 60, bottom: 100 });
    expect(allowed).toMatchObject({ top: 0, bottom: 58 });
  });

  it('draws one segment when nothing was blocked or everything was', () => {
    expect(shapesFor([50], [0])).toHaveLength(1);
    const all = shapesFor([50], [50]);
    expect(all).toHaveLength(1);
    expect(all[0]?.fill).toBe(COLOURS.blocked);
    expect(all[0]?.radii.top).toBeGreaterThan(0);
  });

  it('draws nothing for an hour without lookups', () => {
    expect(shapesFor([0], [0])).toHaveLength(0);
  });

  it('dims every bar but the selected one', () => {
    const shapes = shapesFor([10, 10], [0, 0], 1);
    expect(shapes[0]?.opacity).toBeLessThan(shapes[1]?.opacity ?? 0);
  });
});
