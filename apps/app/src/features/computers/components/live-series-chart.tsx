import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  TimeSeriesChart,
  type ChartPoint,
  type ChartSeries,
  type YDomain,
} from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { maxPoints, newestOf, sumPoints, useSeriesSet } from '../data/series-set';

export interface LiveLine {
  readonly ids: readonly string[];
  readonly combine?: 'sum' | 'max';
  readonly factor?: number;
  readonly label: string;
  readonly colour: ColourRole;
}

export interface LiveSeriesChartProps {
  readonly deviceId: string;
  readonly lines: readonly LiveLine[];
  readonly yDomain: YDomain;
  readonly label: string;
  readonly unit?: string;
  readonly formatValue?: (value: number) => string;
  readonly height?: number;
  readonly spanMs?: number;
  readonly offline?: boolean;
  readonly stack?: boolean;
  readonly legend?: boolean;
  readonly bare?: boolean;
}

const SPAN_MS = 120_000;
const MISSING_HEIGHT = 160;
const MIN_LINE_POINTS = 2;

function combined(
  line: LiveLine,
  lists: readonly (readonly ChartPoint[])[],
): readonly ChartPoint[] {
  if (line.combine === 'sum') return sumPoints(lists);
  if (line.combine === 'max') return maxPoints(lists);
  return lists[0] ?? [];
}

function pointsOf(
  line: LiveLine,
  lists: readonly (readonly ChartPoint[])[],
): readonly ChartPoint[] {
  const own = combined(line, lists);
  const { factor } = line;
  return factor === undefined ? own : own.map((point) => ({ t: point.t, v: point.v * factor }));
}

function seriesOf(
  lines: readonly LiveLine[],
  lists: readonly (readonly ChartPoint[])[],
): {
  readonly label: string;
  readonly colour: ColourRole;
  readonly points: readonly ChartPoint[];
}[] {
  let offset = 0;
  return lines.map((line) => {
    const own = lists.slice(offset, offset + line.ids.length);
    offset += line.ids.length;
    return { label: line.label, colour: line.colour, points: pointsOf(line, own) };
  });
}

function drawableNow(lists: readonly (readonly ChartPoint[])[]): number | null {
  return lists.some((points) => points.length >= MIN_LINE_POINTS) ? newestOf(lists) : null;
}

function ChartPending({ height }: { readonly height: number }): ReactNode {
  const box = { height };
  return (
    <View style={box}>
      <View className="size-full rounded-md bg-surface-3" />
    </View>
  );
}

export interface WindowChartProps extends Omit<
  LiveSeriesChartProps,
  'deviceId' | 'lines' | 'spanMs'
> {
  readonly series: readonly ChartSeries[];
  readonly lists: readonly (readonly ChartPoint[])[];
  readonly spanMs: number;
}

export function WindowChart({
  series,
  lists,
  spanMs,
  yDomain,
  label,
  unit,
  formatValue,
  height,
  offline = false,
  stack,
  legend,
  bare,
}: WindowChartProps): ReactNode {
  const now = drawableNow(lists);
  if (now === null) return <ChartPending height={height ?? MISSING_HEIGHT} />;
  return (
    <TimeSeriesChart
      series={series}
      window={{ spanMs, now }}
      yDomain={yDomain}
      label={label}
      nowRule={offline}
      {...(unit === undefined ? {} : { unit })}
      {...(formatValue === undefined ? {} : { formatValue })}
      {...(height === undefined ? {} : { height })}
      {...(stack === undefined ? {} : { stack })}
      {...(legend === undefined ? {} : { legend })}
      {...(bare === undefined ? {} : { bare })}
    />
  );
}

export function LiveSeriesChart({
  deviceId,
  lines,
  spanMs = SPAN_MS,
  ...chart
}: LiveSeriesChartProps): ReactNode {
  const lists = useSeriesSet(
    deviceId,
    lines.flatMap((line) => line.ids),
  );
  const series = useMemo(() => seriesOf(lines, lists), [lines, lists]);
  return <WindowChart series={series} lists={lists} spanMs={spanMs} {...chart} />;
}
