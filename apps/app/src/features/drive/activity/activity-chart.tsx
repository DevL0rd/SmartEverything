import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks, type BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import { ChartLegend } from '../../../components/charts/chart-legend';
import type { ChartSeries } from '../../../components/charts/chart-model';
import { EmptyGraph } from '../../../components/charts/empty-graph';
import { Text } from '../../../components/text';
import { useDraw } from '../../../components/use-draw';
import { useColour, useColourResolver } from '../../../design/colour';
import { useMotion } from '../../../design/motion';
import { count } from '../../../format/number';
import {
  ACTIVITY_SERIES,
  RANGE_LOOK,
  SERIES_LOOK,
  busiestOf,
  chartSummary,
  seriesTotals,
  type ActivityColumn,
  type ActivityRange,
  type ActivitySeries,
} from './via-model';

export interface ActivityChartProps {
  readonly columns: readonly ActivityColumn[];
  readonly range: ActivityRange;
  readonly peopleName: string;
  readonly filtered: boolean;
}

const PLOT_HEIGHT = 150;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const GAP_SHARE = 0.25;
const PLOT_MIN = { minHeight: PLOT_HEIGHT } as const;

interface PlotBox {
  readonly width: number;
  readonly height: number;
}

type Fills = Readonly<Record<ActivitySeries, string>>;

function columnShapes(
  column: ActivityColumn,
  slot: { readonly x: number; readonly width: number },
  {
    unit,
    fills,
    height,
  }: { readonly unit: number; readonly fills: Fills; readonly height: number },
): BarShape[] {
  const present = ACTIVITY_SERIES.filter((series) => column.counts[series] > 0);
  const last = present.at(-1);
  let bottom = height - 1;
  return present.map((series) => {
    const top = Math.min(bottom - 1, bottom - column.counts[series] * unit);
    const shape: BarShape = {
      key: `${column.key}-${series}`,
      ...slot,
      top,
      bottom,
      radii: { top: series === last ? RADIUS : 0, bottom: 0 },
      opacity: 1,
      fill: fills[series],
    };
    bottom = top - SEGMENT_GAP;
    return shape;
  });
}

export function stackShapes(
  columns: readonly ActivityColumn[],
  { width, height }: PlotBox,
  fills: Fills,
): BarShape[] {
  const peak = Math.max(1, ...columns.map((column) => column.total));
  const present = columns.map(
    (column) => ACTIVITY_SERIES.filter((series) => column.counts[series] > 0).length,
  );
  const gaps = Math.max(0, ...present.map((segments) => segments - 1)) * SEGMENT_GAP;
  const unit = (height - 1 - gaps) / peak;
  const slots = barSlots(columns.length, width, { gap: GAP_SHARE, min: 1 });
  return columns.flatMap((column, index) => {
    const slot = slots[index];
    return slot === undefined ? [] : columnShapes(column, slot, { unit, fills, height });
  });
}

function useFills(): Fills {
  const resolve = useColourResolver();
  return {
    you: resolve(SERIES_LOOK.you.colour),
    people: resolve(SERIES_LOOK.people.colour),
    ai: resolve(SERIES_LOOK.ai.colour),
    automation: resolve(SERIES_LOOK.automation.colour),
    background: resolve(SERIES_LOOK.background.colour),
    outside: resolve(SERIES_LOOK.outside.colour),
  };
}

function Reveal({
  grow,
  height,
  children,
}: {
  readonly grow: SharedValue<number>;
  readonly height: number;
  readonly children: ReactNode;
}): ReactNode {
  const clip = useAnimatedStyle(() => ({ height: height * grow.get() }), [grow, height]);
  const sized = { height };
  return (
    <Animated.View style={clip} className="absolute inset-x-0 bottom-0 overflow-hidden">
      <View style={sized} className="absolute inset-x-0 bottom-0">
        {children}
      </View>
    </Animated.View>
  );
}

function Scale({ peak, height }: { readonly peak: number; readonly height: number }): ReactNode {
  const sized = { height };
  return (
    <View style={sized} className="items-end justify-between">
      <Text variant="caption" tone="variant" className="tabular -mt-2">
        {count(peak)}
      </Text>
      <Text variant="caption" tone="variant" className="tabular -mb-2">
        0
      </Text>
    </View>
  );
}

function Gridline({ width, height }: PlotBox): ReactNode {
  const grid = useColour('outline-variant');
  return (
    <View className="absolute inset-0">
      <Svg width={width} height={height}>
        <Line
          x1={0}
          x2={width}
          y1={0.5}
          y2={0.5}
          stroke={grid}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </Svg>
    </View>
  );
}

function usePlotBox(): PlotBox & { readonly onLayout: (event: LayoutChangeEvent) => void } {
  const [box, setBox] = useState<PlotBox>({ width: 0, height: PLOT_HEIGHT });
  return {
    ...box,
    onLayout: (event): void => {
      const { width, height } = event.nativeEvent.layout;
      setBox((held) => (held.width === width && held.height === height ? held : { width, height }));
    },
  };
}

function Plot({
  columns,
  peak,
}: {
  readonly columns: readonly ActivityColumn[];
  readonly peak: number;
}): ReactNode {
  const { width, height, onLayout } = usePlotBox();
  const fills = useFills();
  const baseline = useColour('outline');
  const grow = useDraw(1, !useMotion().reduced);
  return (
    <View aria-hidden className="flex-row gap-2 large:flex-1">
      <Scale peak={peak} height={height} />
      <View className="min-w-0 flex-1 gap-1">
        <View style={PLOT_MIN} className="large:flex-1" onLayout={onLayout}>
          {width > 0 ? <Gridline width={width} height={height} /> : null}
          {width > 0 ? (
            <Reveal grow={grow} height={height}>
              <Svg width={width} height={height}>
                <BarMarks
                  shapes={stackShapes(columns, { width, height }, fills)}
                  fill={fills.you}
                />
                <Line
                  x1={0}
                  x2={width}
                  y1={height - 0.5}
                  y2={height - 0.5}
                  stroke={baseline}
                  strokeWidth={1}
                />
              </Svg>
            </Reveal>
          ) : null}
        </View>
        <BarLabels bars={columns} width={width} anchor="end" />
      </View>
    </View>
  );
}

function legendOf(
  keys: readonly ActivitySeries[],
  labels: Readonly<Record<ActivitySeries, string>>,
): ChartSeries[] {
  return keys.map((series) => ({
    points: [],
    colour: SERIES_LOOK[series].colour,
    label: labels[series],
  }));
}

function emptyText(filtered: boolean, phrase: string): string {
  return filtered ? 'No changes match these filters' : `No changes ${phrase}`;
}

function ChartHead({
  unit,
  busiest,
}: {
  readonly unit: string;
  readonly busiest: ActivityColumn | null;
}): ReactNode {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text variant="footnote" tone="variant">
        {`Changes per ${unit}`}
      </Text>
      {busiest === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular shrink">
          {`Busiest ${busiest.when} · ${count(busiest.total)}`}
        </Text>
      )}
    </View>
  );
}

export const ActivityChart = memo(function ActivityChart({
  columns,
  range,
  peopleName,
  filtered,
}: ActivityChartProps): ReactNode {
  const labels = {
    you: SERIES_LOOK.you.label,
    people: peopleName,
    ai: SERIES_LOOK.ai.label,
    automation: SERIES_LOOK.automation.label,
    background: SERIES_LOOK.background.label,
    outside: SERIES_LOOK.outside.label,
  };
  const totals = seriesTotals(columns);
  const keys = ACTIVITY_SERIES.filter((key) => totals[key] > 0);
  const series = legendOf(keys, labels);
  const busiest = busiestOf(columns);
  const look = RANGE_LOOK[range];
  return (
    <Card className="large:flex-1">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartSummary(columns, range, labels)}
        className="gap-3 large:flex-1"
      >
        <ChartHead unit={look.unit} busiest={busiest} />
        {busiest === null ? (
          <EmptyGraph text={emptyText(filtered, look.phrase)} height={PLOT_HEIGHT} />
        ) : (
          <Plot columns={columns} peak={busiest.total} />
        )}
        {keys.length === 0 ? null : (
          <ChartLegend
            series={series}
            valueOf={(entry) => {
              const key = keys[series.indexOf(entry)];
              return key === undefined ? null : count(totals[key]);
            }}
          />
        )}
      </View>
    </Card>
  );
});
