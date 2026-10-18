import { extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { startOfDayKey, weekdayShort } from '../../format/time';
import { Text } from '../text';
import { BAR_STUB, BarMarks, type BarShape } from './bar-marks';
import { barSlots } from './bar-path';
import { areaPath, linePath, type Extent } from './scale';

export interface FillValue {
  readonly key: string;
  readonly value: number | null;
}

export interface FillChartProps {
  readonly values: readonly FillValue[];
  readonly kind: 'line' | 'bars';
  readonly colour: ColourRole;
  readonly label: string;
  readonly reference?: number | null;
  readonly band?: Extent | null;
}

interface Drawn {
  readonly chart: FillChartProps;
  readonly area: Area;
  readonly y: (v: number) => number;
  readonly grow: SharedValue<number>;
}

const PAD = 4;
const BAR_GAP = 0.32;
const BAR_RADIUS = 4;
const STUB_RADIUS = 1.5;

interface Area {
  readonly width: number;
  readonly height: number;
}

function domainOf(props: FillChartProps): Extent {
  const known = props.values.flatMap((item) => (item.value === null ? [] : [item.value]));
  const extra = [props.reference ?? null, props.band?.min ?? null, props.band?.max ?? null].flatMap(
    (value) => (value === null ? [] : [value]),
  );
  const [min = 0, max = 0] = extent([...known, ...extra]);
  if (props.kind === 'bars') {
    return { min: 0, max: max <= 0 ? 1 : max };
  }
  const room = Math.max((max - min) * 0.2, Math.abs(max) * 0.01, 0.5);
  return { min: min - room, max: max + room };
}

function xOf(index: number, count: number, area: Area): number {
  return count <= 1 ? area.width / 2 : PAD + (index / (count - 1)) * (area.width - PAD * 2);
}

function LineMarks({
  chart,
  area,
  y,
}: {
  readonly chart: FillChartProps;
  readonly area: Area;
  readonly y: (v: number) => number;
}): ReactNode {
  const stroke = useColour(chart.colour);
  const surface = useColour('surface-1');
  const id = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const count = chart.values.length;
  const placed = chart.values.flatMap((item, index) =>
    item.value === null ? [] : [{ x: xOf(index, count, area), y: y(item.value) }],
  );
  const last = placed.at(-1);
  if (last === undefined) {
    return null;
  }
  const line = linePath(placed);
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.32} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath(placed, area.height)} fill={`url(#${id})`} />
      <Path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={last.x} cy={last.y} r={5} fill={surface} />
      <Circle cx={last.x} cy={last.y} r={3.25} fill={stroke} />
    </>
  );
}

function barShapes({ chart, area, y, grow }: Drawn, track: string): BarShape[] {
  const slots = barSlots(chart.values.length, area.width, { gap: BAR_GAP, min: 2 });
  const lastIndex = chart.values.length - 1;
  return chart.values.flatMap((item, index): BarShape[] => {
    const slot = slots[index];
    if (slot === undefined) {
      return [];
    }
    const base = { key: item.key, x: slot.x, width: slot.width, bottom: area.height };
    if (item.value === null || item.value <= 0) {
      return [
        {
          ...base,
          top: area.height - BAR_STUB,
          radii: { top: STUB_RADIUS, bottom: 0 },
          opacity: 1,
          fill: track,
        },
      ];
    }
    const reached =
      chart.reference !== undefined && chart.reference !== null && item.value >= chart.reference;
    return [
      {
        ...base,
        top: y(item.value),
        radii: { top: Math.min(slot.width / 2, BAR_RADIUS), bottom: 0 },
        opacity: index === lastIndex || reached ? 1 : 0.45,
        grow,
      },
    ];
  });
}

function BarGroup(drawn: Drawn): ReactNode {
  const fill = useColour(drawn.chart.colour);
  const track = useColour('surface-3');
  return <BarMarks shapes={barShapes(drawn, track)} fill={fill} />;
}

function Guides({
  chart,
  area,
  y,
}: {
  readonly chart: FillChartProps;
  readonly area: Area;
  readonly y: (v: number) => number;
}): ReactNode {
  const guide = useColour('on-surface-faint');
  const tint = useColour(chart.colour);
  const band = chart.band ?? null;
  const reference = chart.reference ?? null;
  return (
    <>
      {band === null ? null : (
        <Path
          d={`M0 ${y(band.max).toFixed(1)} H${String(area.width)} V${y(band.min).toFixed(1)} H0 Z`}
          fill={tint}
          fillOpacity={0.08}
        />
      )}
      {reference === null ? null : (
        <Line
          x1={0}
          x2={area.width}
          y1={y(reference)}
          y2={y(reference)}
          stroke={guide}
          strokeWidth={1}
          strokeDasharray="3 4"
          strokeOpacity={0.7}
        />
      )}
    </>
  );
}

function LineClip({ area, grow, children }: Drawn & { readonly children: ReactNode }): ReactNode {
  const clip = useAnimatedStyle(
    () => ({ width: area.width * grow.get(), height: area.height }),
    [area.width, area.height],
  );
  return (
    <Animated.View style={clip} className="absolute left-0 top-0 overflow-hidden">
      {children}
    </Animated.View>
  );
}

function Marks(drawn: Drawn): ReactNode {
  const { chart, area } = drawn;
  if (chart.kind === 'bars') {
    return <BarGroup {...drawn} />;
  }
  return (
    <LineClip {...drawn}>
      <Svg width={area.width} height={area.height}>
        <LineMarks chart={chart} area={area} y={drawn.y} />
      </Svg>
    </LineClip>
  );
}

export function FillChart(props: FillChartProps): ReactNode {
  const [area, setArea] = useState<Area | null>(null);
  const grow = useDraw(1, !useMotion().reduced);
  const domain = domainOf(props);
  const y =
    area === null
      ? null
      : scaleLinear(
          [domain.min, domain.max],
          [area.height - (props.kind === 'bars' ? 0 : PAD * 2), PAD * 2],
        );
  return (
    <View
      className="min-h-8 w-full flex-1"
      accessible
      accessibilityRole="image"
      accessibilityLabel={props.label}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setArea({ width, height });
      }}
    >
      {area === null || y === null || area.width <= 0 || area.height <= 0 ? null : (
        <View pointerEvents="none" className="absolute inset-0">
          <Svg width={area.width} height={area.height}>
            <Guides chart={props} area={area} y={y} />
            {props.kind === 'bars' ? <Marks chart={props} area={area} y={y} grow={grow} /> : null}
          </Svg>
          {props.kind === 'bars' ? null : <Marks chart={props} area={area} y={y} grow={grow} />}
        </View>
      )}
    </View>
  );
}

export function DayAxis({ days }: { readonly days: readonly string[] }): ReactNode {
  return (
    <View className="flex-row" aria-hidden>
      {days.map((day) => (
        <Text key={day} variant="caption" tone="faint" align="center" className="flex-1">
          {weekdayShort(startOfDayKey(day))}
        </Text>
      ))}
    </View>
  );
}
