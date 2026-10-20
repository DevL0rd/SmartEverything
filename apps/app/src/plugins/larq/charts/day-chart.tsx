import type { BottleToday } from '@smarteverything/domain';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { FILL_COLOUR, PACE_COLOUR, WATER_COLOUR } from '../model/bottle-colours';
import { drinkEntryHref } from '../model/entry-href';
import {
  MINUTES_PER_DAY,
  chartSummary,
  cumulativeOf,
  drinkMarks,
  levelPoints,
  levelTrail,
  markNear,
  type DrinkMark,
  type LevelPoint,
} from '../model/day-model';
import { ChartBox } from './chart-box';
import { ChartLabel } from './chart-label';

const LEVEL_HEIGHT = 132;
const CUMULATIVE_HEIGHT = 84;
const PAD = 6;
const LABEL_BAND = 16;
const TICK_HOURS = [0, 6, 12, 18, 24] as const;
const DOT_R = 4;
const NOW_BAND = 16;
const HOUR_LABEL = 28;
const TAP_REACH_PX = 14;

interface DayChartProps {
  readonly today: BottleToday;
  readonly body: number;
  readonly nowMinute: number | null;
}

type Scale = ScaleLinear<number, number>;

function xScale(width: number): Scale {
  return scaleLinear([0, MINUTES_PER_DAY], [PAD, width - PAD]);
}

function stepPath(points: readonly LevelPoint[], x: Scale, y: Scale, end: number): string {
  const [first, ...rest] = points;
  if (first === undefined) {
    return '';
  }
  const steps = rest.map((point) => `H${String(x(point.minute))} V${String(y(point.ml))}`);
  const last = Math.max(end, rest.at(-1)?.minute ?? first.minute);
  return [
    `M${String(x(first.minute))} ${String(y(first.ml))}`,
    ...steps,
    `H${String(x(last))}`,
  ].join(' ');
}

function HourLabels({ x, height }: { readonly x: Scale; readonly height: number }): ReactNode {
  return TICK_HOURS.map((hour) => (
    <ChartLabel
      key={hour}
      left={Math.max(0, x(hour * 60) - HOUR_LABEL / 2)}
      top={height - LABEL_BAND + 2}
      width={HOUR_LABEL}
      text={String(hour).padStart(2, '0')}
      align="center"
      tone="variant"
    />
  ));
}

function HourGrid({ x, height }: { readonly x: Scale; readonly height: number }): ReactNode {
  const faint = useColour('outline-variant');
  return TICK_HOURS.map((hour) => (
    <Line
      key={hour}
      x1={x(hour * 60)}
      x2={x(hour * 60)}
      y1={0}
      y2={height - LABEL_BAND}
      stroke={faint}
      strokeWidth={1}
    />
  ));
}

function DrinkDots({
  marks,
  x,
  y,
  base,
}: {
  readonly marks: readonly DrinkMark[];
  readonly x: Scale;
  readonly y: Scale;
  readonly base: number;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const fill = useColour(FILL_COLOUR);
  const surface = useColour('surface-1');
  return marks.map((mark) => (
    <Circle
      key={`${String(mark.minute)}-${mark.fill ? 'f' : 'd'}`}
      cx={x(mark.minute)}
      cy={mark.levelMl === null ? base - DOT_R : y(mark.levelMl)}
      r={mark.fill ? DOT_R + 0.5 : DOT_R}
      fill={mark.fill ? surface : water}
      stroke={mark.fill ? fill : surface}
      strokeWidth={mark.fill ? 2 : 1.5}
    />
  ));
}

function RejectedDots({
  points,
  x,
  y,
}: {
  readonly points: readonly LevelPoint[];
  readonly x: Scale;
  readonly y: Scale;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const surface = useColour('surface-1');
  return points
    .filter((point) => point.rejected)
    .map((point) => (
      <Circle
        key={`${String(point.minute)}-${String(point.ml)}`}
        cx={x(point.minute)}
        cy={y(point.ml)}
        r={3.5}
        fill={surface}
        stroke={water}
        strokeWidth={1.4}
      />
    ));
}

function NowLine({
  minute,
  x,
  base,
}: {
  readonly minute: number | null;
  readonly x: Scale;
  readonly base: number;
}): ReactNode {
  const text = useColour('on-surface-variant');
  return minute === null ? null : (
    <Line
      x1={x(minute)}
      x2={x(minute)}
      y1={NOW_BAND}
      y2={base}
      stroke={text}
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  );
}

function useOpenDrink(marks: readonly DrinkMark[], x: Scale): ReturnType<typeof Gesture.Tap> {
  const router = useRouter();
  return Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      const entryId = success
        ? (markNear(marks, x.invert(event.x), x.invert(PAD + TAP_REACH_PX))?.entryId ?? null)
        : null;
      if (entryId !== null) {
        router.push(drinkEntryHref(entryId));
      }
    });
}

function NowLabel({
  minute,
  x,
  width,
}: {
  readonly minute: number | null;
  readonly x: Scale;
  readonly width: number;
}): ReactNode {
  return minute === null ? null : (
    <ChartLabel
      left={Math.min(width - 40, Math.max(0, x(minute) - 20))}
      top={0}
      width={40}
      text="Now"
      align="center"
      tone="variant"
    />
  );
}

function LevelPlot({
  today,
  body,
  nowMinute,
  width,
  height,
}: DayChartProps & { readonly width: number; readonly height: number }): ReactNode {
  const water = useColour(WATER_COLOUR);
  const x = xScale(width);
  const base = height - LABEL_BAND;
  const y = scaleLinear([0, body], [base - 2, NOW_BAND + DOT_R]);
  const points = levelPoints(today.levels);
  const trail = levelTrail(today);
  const marks = drinkMarks(today);
  const line = stepPath(trail, x, y, nowMinute ?? 0);
  const first = trail[0];
  const open = useOpenDrink(marks, x);
  return (
    <>
      <GestureDetector gesture={open}>
        <View collapsable={false}>
          <Svg width={width} height={height}>
            <HourGrid x={x} height={height} />
            {first === undefined ? null : (
              <Path
                d={`${line} V${String(base)} H${String(x(first.minute))} Z`}
                fill={water}
                fillOpacity={0.18}
              />
            )}
            <Path d={line} fill="none" stroke={water} strokeWidth={2} strokeLinejoin="round" />
            <RejectedDots points={points} x={x} y={y} />
            <DrinkDots marks={marks} x={x} y={y} base={base} />
            <NowLine minute={nowMinute} x={x} base={base} />
          </Svg>
        </View>
      </GestureDetector>
      <HourLabels x={x} height={height} />
      <NowLabel minute={nowMinute} x={x} width={width} />
    </>
  );
}

function areaPath(steps: ReturnType<typeof cumulativeOf>, x: Scale, y: Scale): string {
  return steps
    .map((point, index) =>
      index === 0
        ? `M${String(x(point.minute))} ${String(y(point.ml))}`
        : `H${String(x(point.minute))} V${String(y(point.ml))}`,
    )
    .join(' ');
}

function CumulativePlot({
  today,
  nowMinute,
  width,
}: DayChartProps & { readonly width: number }): ReactNode {
  const water = useColour(WATER_COLOUR);
  const pace = useColour(PACE_COLOUR);
  const x = xScale(width);
  const base = CUMULATIVE_HEIGHT - LABEL_BAND;
  const y = scaleLinear([0, Math.max(today.goalMl, today.bottleMl, 1)], [base, 8]);
  const steps = cumulativeOf(today);
  const edge = Math.max(nowMinute ?? 0, steps.at(-1)?.minute ?? 0);
  const line = areaPath(steps, x, y);
  const paceEnd = { x: x(today.paceToMinute), y: y(today.goalMl) };
  return (
    <>
      <Svg width={width} height={CUMULATIVE_HEIGHT}>
        <HourGrid x={x} height={CUMULATIVE_HEIGHT} />
        <Path
          d={`${line} H${String(x(edge))} V${String(base)} H${String(x(0))} Z`}
          fill={water}
          fillOpacity={0.22}
        />
        <Path d={line} fill="none" stroke={water} strokeWidth={2} />
        <Line
          x1={x(today.paceFromMinute)}
          y1={y(0)}
          x2={paceEnd.x}
          y2={paceEnd.y}
          stroke={pace}
          strokeWidth={1.6}
          strokeDasharray="5 4"
        />
      </Svg>
      <HourLabels x={x} height={CUMULATIVE_HEIGHT} />
    </>
  );
}

export function LevelChart({
  height,
  ...props
}: DayChartProps & { readonly height: number }): ReactNode {
  return (
    <ChartBox
      label={`${chartSummary(props.today)} Level in the bottle across today.`}
      height={height}
    >
      {(width) => <LevelPlot {...props} width={width} height={height} />}
    </ChartBox>
  );
}

function PaceLegend(): ReactNode {
  const water = { backgroundColor: useColour(WATER_COLOUR) };
  const pace = { borderColor: useColour(PACE_COLOUR) };
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1" aria-hidden>
      <View className="flex-row items-center gap-1.5">
        <View style={water} className="h-0.5 w-4 rounded-full" />
        <Text variant="caption" tone="variant">
          Drunk so far
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View style={pace} className="w-4 border-t-2 border-dashed" />
        <Text variant="caption" tone="variant">
          Expected pace
        </Text>
      </View>
    </View>
  );
}

export function DayChart(props: DayChartProps): ReactNode {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="label">Level in the bottle</Text>
        <ChartBox
          label={`${chartSummary(props.today)} Level and drinks by hour. Tap a drink to open its entry.`}
          height={LEVEL_HEIGHT}
        >
          {(width) => <LevelPlot {...props} width={width} height={LEVEL_HEIGHT} />}
        </ChartBox>
      </View>
      <View className="gap-1">
        <Text variant="label">Drunk from the bottle</Text>
        <ChartBox
          label="Running total of the bottle's drinks against the expected pace."
          height={CUMULATIVE_HEIGHT}
        >
          {(width) => <CumulativePlot {...props} width={width} />}
        </ChartBox>
        <PaceLegend />
      </View>
    </View>
  );
}
