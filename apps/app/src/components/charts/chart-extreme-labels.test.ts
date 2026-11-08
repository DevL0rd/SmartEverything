import { describe, expect, it } from 'vitest';
import { extremeLabelsOf } from './chart-extreme-labels';
import { modelOf, type Model } from './chart-model';

const HOUR = 60 * 60 * 1000;

function model(width: number): Model {
  const plot = modelOf(
    {
      series: [
        {
          label: 'Primary',
          colour: 'viz-1',
          points: [
            { t: 0, v: 30 },
            { t: HOUR, v: 40 },
            { t: 2 * HOUR, v: 10 },
            { t: 3 * HOUR, v: 30 },
          ],
        },
        {
          label: 'Crossing trace',
          colour: 'viz-2',
          points: [
            { t: 0, v: 60 },
            { t: 3 * HOUR, v: 0 },
          ],
        },
      ],
      range: '24h',
      unit: 'µg/m³',
      formatValue: undefined,
      fit: true,
      marker: undefined,
      yDomain: undefined,
    },
    width,
    192,
  );
  if (plot === null) throw new Error('No chart for fixture readings');
  return plot;
}

describe('chart extreme labels', () => {
  it.each([346, 506])('keeps first-series values clear of another trace at width %i', (width) => {
    const plot = model(width);
    const [peak, low] = extremeLabelsOf(plot);
    expect(peak?.value).toBe(40);
    expect(low?.value).toBe(10);
    expect((peak?.top ?? Number.POSITIVE_INFINITY) + 16).toBeLessThan(plot.y(60));
    expect(low?.top).toBeGreaterThan(plot.y(0));
  });
});
