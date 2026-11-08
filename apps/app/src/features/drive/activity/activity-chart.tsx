import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
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
import { useMeasuredWidth } from '../../../components/use-measured-width';
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
}

const PLOT_HEIGHT = 150;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const GAP_SHARE = 0.25;
const PLOT_BOX = { height: PLOT_HEIGHT } as const;

type Fills = Readonly<Record<ActivitySeries, string>>;

function columnShapes(
  column: ActivityColumn,
  slot: { readonly x: number; readonly width: number },
  { unit, fills }: { readonly unit: number; readonly fills: Fills },
): BarShape[] {
  const present = ACTIVITY_SERIES.filter((series) => column.counts[series] > 0);
  const last = present.at(-1);
  let bottom = PLOT_HEIGHT - 1;
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
  width: number,
  fills: Fills,
): BarShape[] {
  const peak = Math.max(1, ...columns.map((column) => column.total));
  const present = columns.map(
    (column) => ACTIVITY_SERIES.filter((series) => column.counts[series] > 0).length,
  );
  const gaps = Math.max(0, ...present.map((segments) => segments - 1)) * SEGMENT_GAP;
  const unit = (PLOT_HEIGHT - 1 - gaps) / peak;
  const slots = barSlots(columns.length, width, { gap: GAP_SHARE, min: 1 });
  return columns.flatMap((column, index) => {
    const slot = slots[index];
    return slot === undefined ? [] : columnShapes(column, slot, { unit, fills });
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
  children,
}: {
  readonly grow: SharedValue<number>;
  readonly children: ReactNode;
}): ReactNode {
  const clip = useAnimatedStyle(() => ({ height: PLOT_HEIGHT * grow.get() }), [grow]);
  return (
    <Animated.View style={clip} className="absolute inset-x-0 bottom-0 overflow-hidden">
      <View style={PLOT_BOX} className="absolute inset-x-0 bottom-0">
        {children}
      </View>
    </Animated.View>
  );
}

function Plot({ columns }: { readonly columns: readonly ActivityColumn[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const fills = useFills();
  const baseline = useColour('outline');
  const grow = useDraw(1, !useMotion().reduced);
  return (
    <View aria-hidden className="gap-1">
      <View style={PLOT_BOX} onLayout={onLayout}>
        {width > 0 ? (
          <Reveal grow={grow}>
            <Svg width={width} height={PLOT_HEIGHT}>
              <BarMarks shapes={stackShapes(columns, width, fills)} fill={fills.you} />
              <Line
                x1={0}
                x2={width}
                y1={PLOT_HEIGHT - 0.5}
                y2={PLOT_HEIGHT - 0.5}
                stroke={baseline}
                strokeWidth={1}
              />
            </Svg>
          </Reveal>
        ) : null}
      </View>
      <BarLabels bars={columns} width={width} />
    </View>
  );
}

function legendOf(labels: Readonly<Record<ActivitySeries, string>>): ChartSeries[] {
  return ACTIVITY_SERIES.map((series) => ({
    points: [],
    colour: SERIES_LOOK[series].colour,
    label: labels[series],
  }));
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
  const series = legendOf(labels);
  const busiest = busiestOf(columns);
  const look = RANGE_LOOK[range];
  return (
    <Card>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartSummary(columns, range, labels)}
        className="gap-3"
      >
        <ChartHead unit={look.unit} busiest={busiest} />
        {busiest === null ? (
          <EmptyGraph text={`No changes ${look.phrase}`} height={PLOT_HEIGHT} />
        ) : (
          <Plot columns={columns} />
        )}
        <ChartLegend
          series={series}
          valueOf={(entry) => {
            const index = series.indexOf(entry);
            const key = ACTIVITY_SERIES[index];
            return key === undefined ? null : count(totals[key]);
          }}
        />
      </View>
    </Card>
  );
});
