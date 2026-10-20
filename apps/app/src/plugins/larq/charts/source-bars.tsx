import type { BottleBar, BottleStatsRange } from '@smarteverything/domain';
import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { rounded } from '../../../features/device-visuals';
import { millilitres } from '../../../format/number';
import { GOAL_COLOUR, SOURCE_COLOUR, SOURCE_LABEL, WATER_COLOUR } from '../model/bottle-colours';
import { barLabelOf, barsPeak, barsSummary } from '../model/stats-model';
import { ChartBox } from './chart-box';
import { ChartKey, type KeyEntry } from './chart-key';
import { ChartLabel } from './chart-label';

const HEIGHT = 200;
const TOP = 16;
const BOTTOM = 18;
const GAP = 0.3;
const RIGHT = 44;

interface SourceBarsProps {
  readonly bars: readonly BottleBar[];
  readonly range: BottleStatsRange;
  readonly goalMl: number;
  readonly averages: { readonly sevenDayMl: number; readonly thirtyDayMl: number } | null;
}

interface Frame {
  readonly width: number;
  readonly y: (ml: number) => number;
  readonly slot: number;
  readonly left: (index: number) => number;
}

type Colours = Readonly<Record<'bottle' | 'logged' | 'other' | 'whole', string>>;

function frameOf(width: number, bars: readonly BottleBar[]): Frame {
  const slot = Math.max(1, width - RIGHT) / Math.max(1, bars.length);
  return {
    width,
    y: scaleLinear([0, barsPeak(bars)], [HEIGHT - BOTTOM, TOP]),
    slot,
    left: (index) => index * slot + (slot * GAP) / 2,
  };
}

function layersOf(bar: BottleBar, colours: Colours): readonly (readonly [number, string])[] {
  if (bar.parts === null) {
    return [[bar.totalMl, colours.whole]];
  }
  return [
    [bar.parts.bottleMl, colours.bottle],
    [bar.parts.loggedMl, colours.logged],
    [bar.parts.otherMl, colours.other],
  ];
}

function Stack({
  bar,
  index,
  frame,
  colours,
}: {
  readonly bar: BottleBar;
  readonly index: number;
  readonly frame: Frame;
  readonly colours: Colours;
}): ReactNode {
  const layers = layersOf(bar, colours);
  let floor = 0;
  return layers.map(([ml, colour], layer) => {
    const top = frame.y(floor + ml);
    const from = frame.y(floor);
    floor += ml;
    return ml <= 0 ? null : (
      <Path
        key={layer}
        d={rounded({
          x: frame.left(index),
          y: top,
          w: frame.slot * (1 - GAP),
          h: Math.max(1, from - top),
          r: layer === layers.length - 1 ? 3 : 0,
        })}
        fill={colour}
      />
    );
  });
}

function Previous({
  bars,
  frame,
}: {
  readonly bars: readonly BottleBar[];
  readonly frame: Frame;
}): ReactNode {
  const edge = useColour('on-surface-variant');
  return bars.map((bar, index) =>
    bar.previousMl === null || bar.previousMl <= 0 ? null : (
      <Path
        key={bar.key}
        d={rounded({
          x: frame.left(index),
          y: frame.y(bar.previousMl),
          w: frame.slot * (1 - GAP),
          h: frame.y(0) - frame.y(bar.previousMl),
          r: 3,
        })}
        fill="none"
        stroke={edge}
        strokeWidth={1.2}
        strokeDasharray="3 3"
      />
    ),
  );
}

function Checks({
  bars,
  frame,
}: {
  readonly bars: readonly BottleBar[];
  readonly frame: Frame;
}): ReactNode {
  const goal = useColour(GOAL_COLOUR);
  return bars.map((bar, index) => {
    const centre = frame.left(index) + (frame.slot * (1 - GAP)) / 2;
    return bar.goalMet ? (
      <Path
        key={bar.key}
        d={`M${String(centre - 3)} ${String(Math.min(frame.y(bar.totalMl), frame.y(bar.previousMl ?? 0)) - 7)} l2.5 2.5 l4 -5`}
        fill="none"
        stroke={goal}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    ) : null;
  });
}

function ReferenceLine({
  frame,
  ml,
  tone,
  dash,
}: {
  readonly frame: Frame;
  readonly ml: number;
  readonly tone: ColourRole;
  readonly dash: string;
}): ReactNode {
  const colour = useColour(tone);
  return (
    <Line
      x1={0}
      x2={frame.width - RIGHT}
      y1={frame.y(ml)}
      y2={frame.y(ml)}
      stroke={colour}
      strokeWidth={1.4}
      strokeDasharray={dash}
    />
  );
}

function ReferenceLabel({
  frame,
  ml,
  text,
}: {
  readonly frame: Frame;
  readonly ml: number;
  readonly text: string;
}): ReactNode {
  return (
    <ChartLabel
      left={frame.width - RIGHT + 4}
      top={frame.y(ml) - 8}
      width={RIGHT - 4}
      text={text}
      tone="variant"
    />
  );
}

function Labels({
  chart,
  frame,
}: {
  readonly chart: SourceBarsProps;
  readonly frame: Frame;
}): ReactNode {
  const { bars, range, goalMl, averages } = chart;
  return (
    <>
      <ReferenceLabel frame={frame} ml={goalMl} text="Goal" />
      {averages === null ? null : (
        <>
          <ReferenceLabel frame={frame} ml={averages.sevenDayMl} text="7 d" />
          <ReferenceLabel frame={frame} ml={averages.thirtyDayMl} text="30 d" />
        </>
      )}
      {bars.map((bar, index) => (
        <ChartLabel
          key={bar.key}
          left={frame.left(index) - 4}
          top={HEIGHT - BOTTOM + 2}
          width={frame.slot * (1 - GAP) + 8}
          text={barLabelOf(bar.key, range)}
          align="center"
          tone="variant"
        />
      ))}
    </>
  );
}

function Plot({
  chart,
  width,
}: {
  readonly chart: SourceBarsProps;
  readonly width: number;
}): ReactNode {
  const { bars, goalMl, averages } = chart;
  const frame = frameOf(width, bars);
  const colours = {
    bottle: useColour(SOURCE_COLOUR.bottle),
    logged: useColour(SOURCE_COLOUR.logged),
    other: useColour(SOURCE_COLOUR.other),
    whole: useColour(WATER_COLOUR),
  };
  return (
    <>
      <Svg width={width} height={HEIGHT}>
        <ReferenceLine frame={frame} ml={goalMl} tone={GOAL_COLOUR} dash="6 4" />
        {averages === null ? null : (
          <>
            <ReferenceLine frame={frame} ml={averages.sevenDayMl} tone="viz-violet" dash="2 3" />
            <ReferenceLine frame={frame} ml={averages.thirtyDayMl} tone="viz-1" dash="8 2 2 2" />
          </>
        )}
        <Previous bars={bars} frame={frame} />
        {bars.map((bar, index) => (
          <Stack key={bar.key} bar={bar} index={index} frame={frame} colours={colours} />
        ))}
        <Checks bars={bars} frame={frame} />
      </Svg>
      <Labels chart={chart} frame={frame} />
    </>
  );
}

function keyOf(
  bars: SourceBarsProps['bars'],
  averages: SourceBarsProps['averages'],
): readonly KeyEntry[] {
  const stacked = bars.some((bar) => bar.parts !== null);
  return [
    ...(stacked
      ? ([
          { label: SOURCE_LABEL.bottle, colour: SOURCE_COLOUR.bottle, mark: 'solid' },
          { label: SOURCE_LABEL.logged, colour: SOURCE_COLOUR.logged, mark: 'solid' },
          { label: SOURCE_LABEL.other, colour: SOURCE_COLOUR.other, mark: 'solid' },
        ] as const)
      : []),
    { label: 'Period before', colour: 'on-surface-variant', mark: 'dashed' },
    { label: 'Goal day', colour: GOAL_COLOUR, mark: 'check' },
    ...(averages === null
      ? []
      : ([
          {
            label: `7-day average ${millilitres(Math.round(averages.sevenDayMl))}`,
            colour: 'viz-violet',
            mark: 'solid',
          },
          {
            label: `30-day average ${millilitres(Math.round(averages.thirtyDayMl))}`,
            colour: 'viz-1',
            mark: 'solid',
          },
        ] as const)),
  ];
}

export function SourceBars(props: SourceBarsProps): ReactNode {
  return (
    <View className="gap-2">
      <ChartBox label={barsSummary(props.bars, props.range)} height={HEIGHT}>
        {(width) => <Plot chart={props} width={width} />}
      </ChartBox>
      <ChartKey entries={keyOf(props.bars, props.averages)} />
    </View>
  );
}
