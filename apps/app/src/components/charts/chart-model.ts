import { decimal } from '../../format/number';
import type { ColourRole } from '../../design/tokens';
import { reduced } from './reduce';
import { liveTicks, liveWindowOf, type LiveWindow, type YDomain } from './live-window';
import {
  decimalsOf,
  livePlotModel,
  plotModel,
  type ChartPoint,
  type ChartRange,
  type Extent,
  type PlotModel,
} from './scale';

export interface ChartSeries {
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly label: string;
}

interface ChartProps {
  readonly series: readonly ChartSeries[];
  readonly unit?: string;
  readonly height?: number;
  readonly formatValue?: (value: number) => string;
}

export interface StaticChartProps extends ChartProps {
  readonly range: ChartRange;
  readonly fit?: boolean;
  readonly marker?: ChartMarker;
  readonly yDomain?: readonly [number, number];
  readonly label?: string;
  readonly window?: undefined;
}

export interface LiveChartProps extends ChartProps {
  readonly window: LiveWindow;
  readonly yDomain: YDomain;
  readonly label: string;
  readonly stack?: boolean;
  readonly area?: boolean;
  readonly legend?: boolean;
  readonly nowRule?: boolean;
  readonly bare?: boolean;
}

export type TimeSeriesChartProps = StaticChartProps | LiveChartProps;

interface ChartMarker {
  readonly at: number;
  readonly label: string;
}

const AXIS_W = 40;
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

export interface ModelInput {
  readonly series: readonly ChartSeries[];
  readonly range: ChartRange;
  readonly unit: string | undefined;
  readonly formatValue: ((value: number) => string) | undefined;
  readonly fit: boolean | undefined;
  readonly marker: ChartMarker | undefined;
  readonly yDomain: readonly [number, number] | undefined;
}

const GLYPH_W = 7;
const GUTTER_PAD = 10;

function gutterOf(labels: readonly string[]): number {
  const longest = labels.reduce((most, label) => Math.max(most, label.length), 0);
  return Math.max(AXIS_W, Math.ceil(longest * GLYPH_W) + GUTTER_PAD);
}

function staticModelAt(
  props: ModelInput,
  width: number,
  height: number,
  left: number,
): Model | null {
  const box = {
    width,
    height,
    left,
    right: width - RIGHT_PAD,
    top: TOP_PAD,
    bottom: height - X_AXIS_H - BOTTOM_PAD,
  };
  const [low, high] = props.yDomain ?? [];
  const domain = low === undefined || high === undefined ? null : { min: low, max: high };
  const plot = plotModel(props.series, props.range, box, { fit: props.fit === true, domain });
  if (plot === null) {
    return null;
  }
  const columns = box.right - box.left;
  return {
    ...plot,
    drawn: plot.drawn.map((entry) => ({
      ...entry,
      segments: entry.segments.map((segment) => reduced(segment, columns)),
    })),
    format: props.formatValue ?? ((value: number): string => decimal(value, decimalsOf(plot.step))),
    unit: props.unit ?? null,
    marker: props.marker ?? null,
  };
}

export function modelOf(props: ModelInput, width: number, height: number): Model | null {
  const first = staticModelAt(props, width, height, AXIS_W);
  if (first === null) {
    return null;
  }
  const left = gutterOf(first.yTicks.map(first.format));
  return left === AXIS_W ? first : staticModelAt(props, width, height, left);
}

const LIVE_RIGHT_PAD = 8;
const LIVE_X_GAP = 8;
const LIVE_TOP_PAD = 8;
const BARE_PAD = 2;
const LIVE_GAP_MS = 5000;

export interface LiveModelInput {
  readonly series: readonly ChartSeries[];
  readonly window: LiveWindow;
  readonly domain: Extent;
  readonly unit: string | undefined;
  readonly formatValue: ((value: number) => string) | undefined;
  readonly bare: boolean;
}

export function liveModelOf(input: LiveModelInput, width: number, height: number): Model {
  const middle = (input.domain.min + input.domain.max) / 2;
  const format =
    input.formatValue ??
    ((value: number): string => decimal(value, decimalsOf(middle - input.domain.min)));
  const left = gutterOf([input.domain.min, middle, input.domain.max].map(format));
  const box = input.bare
    ? {
        width,
        height,
        left: BARE_PAD,
        right: width - BARE_PAD,
        top: BARE_PAD,
        bottom: height - BARE_PAD,
      }
    : {
        width,
        height,
        left,
        right: width - LIVE_RIGHT_PAD,
        top: LIVE_TOP_PAD,
        bottom: height - X_AXIS_H - LIVE_X_GAP,
      };
  const plot = livePlotModel(
    input.series,
    {
      window: liveWindowOf(input.window),
      domain: input.domain,
      ticks: liveTicks(input.window),
      maxGap: LIVE_GAP_MS,
    },
    box,
  );
  const columns = box.right - box.left;
  return {
    ...plot,
    drawn: plot.drawn.map((entry) => ({
      ...entry,
      segments: entry.segments.map((segment) => reduced(segment, columns)),
    })),
    format,
    unit: input.unit ?? null,
    marker: null,
  };
}
