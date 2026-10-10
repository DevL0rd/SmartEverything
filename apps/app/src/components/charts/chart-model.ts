import { decimal } from '../../format/number';
import type { ColourRole } from '../../design/tokens';
import { decimalsOf, plotModel, type ChartPoint, type ChartRange, type PlotModel } from './scale';

export interface ChartSeries {
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly label: string;
}

export interface TimeSeriesChartProps {
  readonly series: readonly ChartSeries[];
  readonly range: ChartRange;
  readonly unit?: string;
  readonly height?: number;
  readonly formatValue?: (value: number) => string;
  readonly fit?: boolean;
  readonly marker?: ChartMarker;
}

export interface ChartMarker {
  readonly at: number;
  readonly label: string;
}

export const AXIS_W = 40;
const RIGHT_PAD = 8;
const TOP_PAD = 18;
export const X_AXIS_H = 20;
const BOTTOM_PAD = 18;
export const LABEL_W = 64;
export const READOUT_W = 144;
export const LONG_PRESS_MS = 300;

export interface Model extends PlotModel<ChartSeries> {
  readonly format: (v: number) => string;
  readonly unit: string | null;
  readonly marker: ChartMarker | null;
}

export function modelOf(props: TimeSeriesChartProps, width: number, height: number): Model | null {
  const box = {
    width,
    height,
    left: AXIS_W,
    right: width - RIGHT_PAD,
    top: TOP_PAD,
    bottom: height - X_AXIS_H - BOTTOM_PAD,
  };
  const plot = plotModel(props.series, props.range, box, props.fit === true);
  if (plot === null) {
    return null;
  }
  return {
    ...plot,
    format: props.formatValue ?? ((value: number): string => decimal(value, decimalsOf(plot.step))),
    unit: props.unit ?? null,
    marker: props.marker ?? null,
  };
}
