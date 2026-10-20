import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarMarks, type BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import { Swatch } from '../../../components/charts/chart-legend';
import type { ChartPoint } from '../../../components/charts/scale';
import { Sparkline } from '../../../components/charts/sparkline';
import { Grid } from '../../../components/grid';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { count as formatCount, percent } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';
import { durationLabel, type ChartDay, type ChartSummary } from './run-history-model';

const PANEL_MIN_WIDTH = 280;
const PLOT_HEIGHT = 64;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const PLOT_BOX = { height: PLOT_HEIGHT } as const;

function stackOf(days: readonly ChartDay[], width: number, failedFill: string): BarShape[] {
  const peak = Math.max(1, ...days.map((day) => day.total));
  const slots = barSlots(days.length, width, { gap: 0.25, min: 1 });
  const unit = (PLOT_HEIGHT - 1) / peak;
  return days.flatMap((day, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined || day.total === 0) return [];
    const okHeight = day.ok * unit;
    const failedHeight = day.failed * unit;
    const base = PLOT_HEIGHT - 1;
    const okTop = base - okHeight;
    const shapes: BarShape[] = [];
    if (day.ok > 0) {
      shapes.push({
        key: `${day.day}-ok`,
        ...slot,
        top: okTop,
        bottom: base,
        radii: { top: day.failed > 0 ? 0 : RADIUS, bottom: 0 },
        opacity: 1,
      });
    }
    if (day.failed > 0) {
      const bottom = day.ok > 0 ? okTop - SEGMENT_GAP : base;
      shapes.push({
        key: `${day.day}-failed`,
        ...slot,
        top: Math.min(bottom - 1, bottom - failedHeight),
        bottom,
        radii: { top: RADIUS, bottom: 0 },
        opacity: 1,
        fill: failedFill,
      });
    }
    return shapes;
  });
}

function Stack({ days }: { readonly days: readonly ChartDay[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const ok = useColour('primary');
  const failed = useColour('critical');
  const baseline = useColour('outline');
  const shapes = width > 0 ? stackOf(days, width, failed) : [];
  return (
    <View style={PLOT_BOX} onLayout={onLayout} aria-hidden>
      {width > 0 ? (
        <Svg width={width} height={PLOT_HEIGHT}>
          <BarMarks shapes={shapes} fill={ok} />
          <Line
            x1={0}
            x2={width}
            y1={PLOT_HEIGHT - 0.5}
            y2={PLOT_HEIGHT - 0.5}
            stroke={baseline}
            strokeWidth={1}
          />
        </Svg>
      ) : null}
    </View>
  );
}

function pointsOf(days: readonly ChartDay[], pick: (day: ChartDay) => number | null): ChartPoint[] {
  return days.flatMap((day, index) => {
    const v = pick(day);
    return v === null ? [] : [{ t: index, v }];
  });
}

function Span({ days }: { readonly days: readonly ChartDay[] }): ReactNode {
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return null;
  return (
    <View className="flex-row justify-between">
      <Text variant="caption" tone="faint">
        {shortDate(startOfDayKey(first.day))}
      </Text>
      <Text variant="caption" tone="faint">
        {shortDate(startOfDayKey(last.day))}
      </Text>
    </View>
  );
}

function Legend({
  items,
}: {
  readonly items: readonly {
    label: string;
    colour: 'primary' | 'critical' | 'on-surface-variant';
  }[];
}): ReactNode {
  return (
    <View className="flex-row gap-4">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <Swatch colour={item.colour} />
          <Text variant="caption" tone="variant">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RunsPanel({ summary }: { readonly summary: ChartSummary }): ReactNode {
  const { totals, days } = summary;
  return (
    <Card
      label={`Runs per day, ${formatCount(totals.total)} in total, ${formatCount(totals.failed)} failed`}
    >
      <View className="gap-1">
        <Text variant="footnote" tone="variant">
          Runs per day
        </Text>
        <Text variant="title-2" className="tabular">
          {formatCount(totals.total)}
        </Text>
      </View>
      <Stack days={days} />
      <Span days={days} />
      <Legend
        items={[
          { label: 'Done', colour: 'primary' },
          { label: 'Failed', colour: 'critical' },
        ]}
      />
    </Card>
  );
}

function RatePanel({ summary }: { readonly summary: ChartSummary }): ReactNode {
  const { totals, days } = summary;
  const text = totals.rate === null ? 'No finished runs' : percent(totals.rate);
  return (
    <Card label={`Failure rate, ${text}`}>
      <View className="gap-1">
        <Text variant="footnote" tone="variant">
          Failure rate
        </Text>
        <Text
          variant="title-2"
          tone={totals.failed > 0 ? 'critical' : 'default'}
          className="tabular"
        >
          {text}
        </Text>
      </View>
      <Sparkline
        points={pointsOf(days, (day) => day.rate)}
        colour="critical"
        height={PLOT_HEIGHT}
        domain={[0, 1]}
        maxGap={1}
      />
      <Span days={days} />
      <Legend items={[{ label: 'Failed of finished runs', colour: 'critical' }]} />
    </Card>
  );
}

function DurationPanel({ summary }: { readonly summary: ChartSummary }): ReactNode {
  const { totals, days } = summary;
  const peak = Math.max(1, ...days.map((day) => day.p95 ?? 0));
  const typical = totals.p50 === null ? 'No timings' : durationLabel(totals.p50);
  const slow = totals.p95 === null ? null : durationLabel(totals.p95);
  return (
    <Card label={`Run time, typical ${typical}${slow === null ? '' : `, slowest ${slow}`}`}>
      <View className="gap-1">
        <Text variant="footnote" tone="variant">
          Run time
        </Text>
        <Text variant="title-2" className="tabular">
          {slow === null ? typical : `${typical} · ${slow}`}
        </Text>
      </View>
      <View style={PLOT_BOX}>
        <View className="absolute inset-x-0 top-0">
          <Sparkline
            points={pointsOf(days, (day) => day.p95)}
            colour="on-surface-variant"
            height={PLOT_HEIGHT}
            domain={[0, peak]}
            maxGap={1}
          />
        </View>
        <View className="absolute inset-x-0 top-0">
          <Sparkline
            points={pointsOf(days, (day) => day.p50)}
            colour="primary"
            height={PLOT_HEIGHT}
            domain={[0, peak]}
            maxGap={1}
          />
        </View>
      </View>
      <Span days={days} />
      <Legend
        items={[
          { label: 'Typical (p50)', colour: 'primary' },
          { label: 'Slowest 5% (p95)', colour: 'on-surface-variant' },
        ]}
      />
    </Card>
  );
}

export function RunsChart({ summary }: { readonly summary: ChartSummary }): ReactNode {
  return (
    <Grid minItemWidth={PANEL_MIN_WIDTH}>
      <RunsPanel summary={summary} />
      <RatePanel summary={summary} />
      <DurationPanel summary={summary} />
    </Grid>
  );
}
