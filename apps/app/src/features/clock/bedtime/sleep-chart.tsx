import type { PlannerBedtime, PlannerSleep } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { G } from 'react-native-svg';
import { Card } from '../../../components/card';
import {
  axisShare,
  barsFrameOf,
  clockTickLabel,
  clockTicks,
  columnLabel,
  minuteClock,
  slotsOf,
  windowReadout,
  type BarsFrame,
  type ColumnReadout,
  type Slot,
} from '../../../components/charts/night-bars-model';
import {
  ColumnLabels,
  Cursor,
  GuideLine,
  GutterText,
  LegendRow,
  PlotLayer,
  ScrubSurface,
  Swatch,
} from '../../../components/charts/night-bars-parts';
import {
  Highlight,
  NightBar,
  Placeholder,
  yOf,
} from '../../../components/charts/sleep-window-marks';
import { Figure } from '../../../components/figure';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { useIdiom } from '../../../design/platform';
import { localDayKey } from '../../../format/time';
import { QueryBody } from '../../planner';
import { useSleepNights } from './bedtime-data';
import { sleepLengthText } from './dial-model';
import {
  driftTextOf,
  sleepColumnsOf,
  sleepFactsOf,
  sleepSummaryOf,
  sleepWindowOf,
  type SleepColumn,
  type SleepFacts,
  type SleepSpan,
} from './sleep-chart-model';

const SPANS: readonly SegmentedOption<SleepSpan>[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const CHART_HEIGHT = 220;

function readoutOf(span: SleepSpan, column: SleepColumn): ColumnReadout {
  const base = windowReadout(span, column);
  if (column.planned === null) return base;
  const plan = `${minuteClock(column.planned.bed)} – ${minuteClock(column.planned.wake)}`;
  return {
    ...base,
    rows: [...base.rows, { label: 'Plan', value: plan, stage: null }],
    text: `${base.text} · plan ${plan}`,
  };
}

function Columns({
  frame,
  slots,
  columns,
  current,
}: {
  readonly frame: BarsFrame;
  readonly slots: readonly Slot[];
  readonly columns: readonly SleepColumn[];
  readonly current: number | null;
}): ReactNode {
  const slotWidth = slots.length === 0 ? 0 : (frame.right - frame.left) / slots.length;
  return (
    <G>
      {columns.map((column, index) => {
        const slot = slots[index];
        if (slot === undefined) return null;
        return (
          <G key={column.key}>
            {index === current ? (
              <Highlight frame={frame} slot={slot} slotWidth={slotWidth} />
            ) : null}
            <NightBar frame={frame} slot={slot} column={column} colour="sleep-core" />
            {column.planned === null ? null : (
              <Placeholder frame={frame} slot={slot} usual={column.planned} />
            )}
          </G>
        );
      })}
    </G>
  );
}

function Guides({ frame }: { readonly frame: BarsFrame }): ReactNode {
  return (
    <G>
      {clockTicks().map((tick) => (
        <GuideLine key={tick} frame={frame} y={yOf(frame, axisShare(tick))} />
      ))}
    </G>
  );
}

function Gutters({ frame }: { readonly frame: BarsFrame }): ReactNode {
  return clockTicks().map((tick) => (
    <GutterText
      key={tick}
      left={0}
      top={yOf(frame, axisShare(tick)) - 8}
      width={frame.left - 6}
      align="end"
      text={clockTickLabel(tick)}
    />
  ));
}

function Plot({
  columns,
  span,
  frame,
  wide,
  summary,
}: {
  readonly summary: string;
  readonly columns: readonly SleepColumn[];
  readonly span: SleepSpan;
  readonly frame: BarsFrame;
  readonly wide: boolean;
}): ReactNode {
  const [current, setCurrent] = useState<number | null>(null);
  const slots = slotsOf(span, columns.length, frame.left, frame.right);
  const active = current === null ? undefined : columns[current];
  const centre = current === null ? undefined : slots[current];
  const readout = active === undefined ? null : readoutOf(span, active);
  return (
    <ScrubSurface
      count={columns.length}
      frame={frame}
      current={current}
      set={setCurrent}
      summary={summary}
      readoutText={readout === null ? null : readout.text}
    >
      <PlotLayer frame={frame}>
        <Guides frame={frame} />
        <Columns frame={frame} slots={slots} columns={columns} current={current} />
      </PlotLayer>
      <Gutters frame={frame} />
      <ColumnLabels
        frame={frame}
        span={span}
        slots={slots}
        labels={columns.map((column) => columnLabel(span, column.at, !wide))}
        current={current}
      />
      {readout === null || centre === undefined ? null : (
        <Cursor frame={frame} centre={centre.centre} readout={readout} />
      )}
    </ScrubSurface>
  );
}

function PlanChart({
  columns,
  span,
  summary,
}: {
  readonly summary: string;
  readonly columns: readonly SleepColumn[];
  readonly span: SleepSpan;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const wide = useIdiom() === 'pointer';
  const frame = {
    ...barsFrameOf({ width, height: CHART_HEIGHT, span, wide }),
    right: Math.max(45, width - 8),
  };
  const box = { height: CHART_HEIGHT };
  return (
    <View className="w-full" style={box} onLayout={onLayout}>
      {width === 0 ? null : (
        <Plot columns={columns} span={span} frame={frame} wide={wide} summary={summary} />
      )}
    </View>
  );
}

function PlannedSwatch(): ReactNode {
  const stroke = useColour('on-surface-faint');
  const paint = { borderColor: stroke };
  return <View style={paint} className="size-2.5 rounded-sm border border-dashed" />;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        {label}
      </Text>
      <Figure value={value} size="s" />
    </View>
  );
}

function SleepFactsRow({ facts }: { readonly facts: SleepFacts }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-8 gap-y-3">
      <Fact
        label="Asleep on average"
        value={facts.averageAsleep === null ? '–' : sleepLengthText(facts.averageAsleep)}
      />
      <Fact
        label="Last 7 nights"
        value={facts.weekAverage === null ? '–' : sleepLengthText(facts.weekAverage)}
      />
      <Fact label="Bed against plan" value={driftTextOf(facts.bedDrift)} />
      <Fact label="Up against plan" value={driftTextOf(facts.wakeDrift)} />
    </View>
  );
}

function ChartBody({
  sleep,
  bedtime,
  span,
  today,
  zone,
}: {
  readonly sleep: PlannerSleep;
  readonly bedtime: PlannerBedtime;
  readonly span: SleepSpan;
  readonly today: string;
  readonly zone: string;
}): ReactNode {
  const columns = sleepColumnsOf({ sleep, bedtime, span, today, zone });
  const facts = sleepFactsOf(sleep, columns);
  if (facts.recorded === 0) {
    return (
      <Text variant="footnote" tone="variant">
        {`No sleep recorded this ${span}. Nights from Health Connect show here against your plan.`}
      </Text>
    );
  }
  return (
    <View className="gap-4">
      <LegendRow
        items={[
          { label: 'Slept', swatch: <Swatch colour="sleep-core" /> },
          ...(bedtime.enabled ? [{ label: 'Planned', swatch: <PlannedSwatch /> }] : []),
        ]}
      />
      <PlanChart
        columns={columns}
        span={span}
        summary={`Sleep against your plan. ${sleepSummaryOf(facts, span)}`}
      />
      <SleepFactsRow facts={facts} />
    </View>
  );
}

export function SleepChartCard({
  bedtime,
  now,
  zone,
}: {
  readonly bedtime: PlannerBedtime;
  readonly now: number;
  readonly zone: string;
}): ReactNode {
  const [span, setSpan] = useState<SleepSpan>('week');
  const today = localDayKey(now, zone);
  const window = sleepWindowOf(span, today, zone);
  const query = useSleepNights(null, window);
  return (
    <Card
      title="Your nights"
      icon="bed"
      action={<Segmented options={SPANS} value={span} onChange={setSpan} label="Range" compact />}
    >
      <QueryBody query={query}>
        {(sleep) => (
          <ChartBody sleep={sleep} bedtime={bedtime} span={span} today={today} zone={zone} />
        )}
      </QueryBody>
    </Card>
  );
}
