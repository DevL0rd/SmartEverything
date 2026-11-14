import type { PlannerStats, PlannerStatsRange } from '@smarteverything/domain';
import { scaleLinear } from 'd3-scale';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks } from '../../../components/charts/bar-marks';
import { Figure } from '../../../components/figure';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { clockOfMinutes } from '../../../format/time';
import { usePlannerRings, usePlannerStats } from '../../planner/data';
import { QueryBody } from '../../planner/frame/query-body';
import { ringWindowOf, spreadWordsOf } from '../../planner/insights/alarm-model';
import {
  hasWakeData,
  wakeInsightsOf,
  wakeScaleOf,
  wakeSpokenOf,
  type WakeBucket,
  type WakeInsights,
  type WakeScale,
} from './wake-model';

const RANGES: readonly SegmentedOption<PlannerStatsRange>[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const AXIS = 44;
const LABEL_LIFT = 8;
const DOT = 4;
const PAD = DOT + 2;

interface PlotProps {
  readonly buckets: readonly WakeBucket[];
  readonly scale: WakeScale;
  readonly width: number;
  readonly height: number;
}

function Gridlines({ scale, width, height }: Omit<PlotProps, 'buckets'>): ReactNode {
  const grid = useColour('outline-variant');
  const y = scaleLinear([scale.from, scale.to], [PAD, height - PAD]);
  return (
    <>
      {scale.ticks.map((tick) => (
        <Line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke={grid} />
      ))}
    </>
  );
}

function Marks({ buckets, scale, width, height }: PlotProps): ReactNode {
  const band = useColour('primary-container');
  const alarm = useColour('primary');
  const wake = useColour('on-surface-variant');
  const y = scaleLinear([scale.from, scale.to], [PAD, height - PAD]);
  const slot = width / Math.max(1, buckets.length);
  const radius = Math.min(DOT, slot / 3);
  return (
    <>
      {buckets.map((bucket, index) => {
        if (bucket.alarm === null || bucket.wake === null) return null;
        const x = slot * (index + 0.5);
        const capsule = {
          key: bucket.key,
          x: x - radius * 1.5,
          width: radius * 3,
          top: y(Math.min(bucket.alarm, bucket.wake)) - radius,
          bottom: y(Math.max(bucket.alarm, bucket.wake)) + radius,
          radii: { top: radius * 1.5, bottom: radius * 1.5 },
          opacity: 1,
        };
        return (
          <G key={bucket.key}>
            <BarMarks shapes={[capsule]} fill={band} />
            <Circle cx={x} cy={y(bucket.wake)} r={radius} fill={wake} />
            <Circle cx={x} cy={y(bucket.alarm)} r={radius} fill={alarm} />
          </G>
        );
      })}
    </>
  );
}

function AxisLabels({
  scale,
  height,
}: {
  readonly scale: WakeScale;
  readonly height: number;
}): ReactNode {
  const y = scaleLinear([scale.from, scale.to], [PAD, height - PAD]);
  const box = { height };
  return (
    <View style={box} className="w-11">
      {scale.ticks.map((tick) => {
        const place = { top: y(tick) - LABEL_LIFT };
        return (
          <View key={tick} className="absolute left-0" style={place}>
            <Text variant="caption" tone="variant" className="tabular">
              {clockOfMinutes(tick)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function WakeChart({
  buckets,
  height,
}: {
  readonly buckets: readonly WakeBucket[];
  readonly height: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const scale = wakeScaleOf(buckets);
  const plot = Math.max(0, width - AXIS);
  const spoken = buckets.map((bucket) => wakeSpokenOf(bucket, clockOfMinutes)).join('. ');
  const box = { height };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Alarm time against wake time. ${spoken}`}
      className="min-w-0 flex-1 gap-1"
      onLayout={onLayout}
    >
      <View className="flex-row" style={box}>
        {scale === null ? null : <AxisLabels scale={scale} height={height} />}
        {scale === null || plot === 0 ? null : (
          <Svg width={plot} height={height}>
            <Gridlines scale={scale} width={plot} height={height} />
            <Marks buckets={buckets} scale={scale} width={plot} height={height} />
          </Svg>
        )}
      </View>
      <View className="ml-11">
        <BarLabels bars={buckets} width={plot} />
      </View>
    </View>
  );
}

function Dot({ colour, label }: { readonly colour: string; readonly label: string }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('size-2 rounded-full', colour)} />
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function lostText(insights: WakeInsights): string {
  if (insights.lostAverage === null)
    return insights.missed === 0 ? 'none missed' : `${String(insights.missed)} missed`;
  return `avg ${String(insights.lostAverage)} min lost`;
}

function WakeFacts({
  insights,
  range,
  compact,
}: {
  readonly insights: WakeInsights;
  readonly range: PlannerStatsRange;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className={compact ? 'flex-row flex-wrap gap-x-6 gap-y-2' : 'w-45 gap-3'}>
      <View className="gap-0.5">
        <Text variant="caption" tone="variant">
          Consistency
        </Text>
        <Figure
          value={spreadWordsOf(insights.spread)}
          size={compact ? 's' : 'l'}
          {...(insights.spread === null ? {} : { unit: 'min' })}
        />
      </View>
      <View className="gap-0.5">
        <Text variant="caption" tone="variant">
          {`Snoozes this ${range}`}
        </Text>
        <View className="flex-row items-baseline gap-2">
          <Figure value={String(insights.snoozes)} size="s" />
          <Text variant="caption" tone="variant" className="tabular">
            {lostText(insights)}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-4">
        <Dot colour="bg-primary" label="Alarm" />
        <Dot colour="bg-on-surface-variant" label="Awake" />
      </View>
    </View>
  );
}

function WakeBody({
  insights,
  range,
  compact,
}: {
  readonly insights: WakeInsights;
  readonly range: PlannerStatsRange;
  readonly compact: boolean;
}): ReactNode {
  if (!hasWakeData(insights)) {
    return (
      <Text variant="footnote" tone="variant">
        {`No alarm rang this ${range}.`}
      </Text>
    );
  }
  const chart = <WakeChart buckets={insights.buckets} height={compact ? 96 : 150} />;
  if (compact) {
    return (
      <View className="gap-3">
        {chart}
        <WakeFacts insights={insights} range={range} compact />
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-6">
      {chart}
      <WakeFacts insights={insights} range={range} compact={false} />
    </View>
  );
}

interface WakeView {
  readonly range: PlannerStatsRange;
  readonly compact: boolean;
  readonly timeZone: string;
}

function WakeRings({
  stats,
  view,
}: {
  readonly stats: PlannerStats;
  readonly view: WakeView;
}): ReactNode {
  const window = ringWindowOf(stats);
  const rings = usePlannerRings(null, window.from, window.to);
  return (
    <QueryBody query={rings}>
      {(rows) => (
        <WakeBody
          insights={wakeInsightsOf(stats, rows, view.timeZone)}
          range={view.range}
          compact={view.compact}
        />
      )}
    </QueryBody>
  );
}

function WakeData({ view }: { readonly view: WakeView }): ReactNode {
  const query = usePlannerStats(null, view.range);
  return <QueryBody query={query}>{(stats) => <WakeRings stats={stats} view={view} />}</QueryBody>;
}

export function WakeInsightsCard({
  compact,
  timeZone,
}: {
  readonly compact: boolean;
  readonly timeZone: string;
}): ReactNode {
  const [range, setRange] = useState<PlannerStatsRange>('week');
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">Wake insights</Text>
          <Text variant="caption" tone="variant">
            Alarm time against when you stopped it
          </Text>
        </View>
        <Segmented options={RANGES} value={range} onChange={setRange} label="Range" compact />
      </View>
      <WakeData view={{ range, compact, timeZone }} />
    </Card>
  );
}
