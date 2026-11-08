import { describe, expect, it, vi } from 'vitest';

vi.mock('./air-chart-widget', () => ({ AirChartWidget: (): null => null }));
vi.mock('./air-quality-widget', () => ({ AirQualityWidget: (): null => null }));
vi.mock('./comfort-widget', () => ({ ComfortWidget: (): null => null }));
vi.mock('./outdoor-widget', () => ({ OutdoorWidget: (): null => null }));
vi.mock('./supplies-widget', () => ({ SuppliesWidget: (): null => null }));

const { CLIMATE_WIDGETS } = await import('./catalogue');

describe('the climate widget catalogue', () => {
  it.each(CLIMATE_WIDGETS.map((widget) => [widget.type, widget] as const))(
    'offers the %s default size on every board class',
    (_, widget) => {
      for (const offered of Object.values(widget.sizes)) {
        expect(offered).toContain(widget.defaultSize);
      }
    },
  );

  it('offers the same sizes on every board class', () => {
    for (const widget of CLIMATE_WIDGETS) {
      const [first, ...rest] = Object.values(widget.sizes);
      for (const offered of rest) {
        expect(offered).toEqual(first);
      }
    }
  });
});
