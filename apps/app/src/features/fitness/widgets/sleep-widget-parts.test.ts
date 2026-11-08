import { describe, expect, it } from 'vitest';
import { widgetBodyHeight } from '../../../components/widget-board/widget-frame-metrics';
import { TYPE_SCALE } from '../../../design/tokens';
import { columnFitOf, rowFitOf } from './sleep-widget-parts';

describe('rowFitOf', () => {
  it('sizes the score ring to the small headline so the top row stays one line pair', () => {
    expect(rowFitOf({ width: 348, height: 140, idiom: 'touch' })).toStrictEqual({
      ring: 40,
      scale: 's',
    });
    expect(rowFitOf({ width: 348, height: 120, idiom: 'pointer' }).ring).toBe(36);
  });

  it('leaves room under the top row for the stage chart and the legend grid', () => {
    for (const frame of [
      { width: 348, height: 140, idiom: 'touch' },
      { width: 348, height: 120, idiom: 'pointer' },
    ] as const) {
      const legend = 2 * TYPE_SCALE[frame.idiom].footnote[1] + 2;
      expect(widgetBodyHeight(frame) - rowFitOf(frame).ring - 4).toBeGreaterThanOrEqual(legend);
    }
  });
});

describe('columnFitOf', () => {
  it('gives the ring the height left after the times and goal lines', () => {
    const frame = { width: 700, height: 140, idiom: 'touch' } as const;
    expect(columnFitOf(frame).ring).toBe(Math.floor(widgetBodyHeight(frame) - 40));
  });

  it('uses the medium headline only when it fits beside the ring', () => {
    expect(columnFitOf({ width: 700, height: 140, idiom: 'touch' }).scale).toBe('s');
    expect(columnFitOf({ width: 700, height: 144, idiom: 'touch' }).scale).toBe('m');
    expect(columnFitOf({ width: 640, height: 120, idiom: 'pointer' }).scale).toBe('s');
  });
});
