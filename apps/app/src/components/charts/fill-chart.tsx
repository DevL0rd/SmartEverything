import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useTween } from '../use-tween';
import type { ColourRole } from '../../design/tokens';
import { startOfDayKey, weekdayShort } from '../../format/time';
import { Text } from '../text';
import { linePath, scaleLinear, type Extent } from './scale';

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
  readonly grow: number;
}

const PAD = 4;
const BAR_GAP = 0.32;
const STUB = 3;

interface Area {
  readonly width: number;
  readonly height: number;
}

function domainOf(props: FillChartProps): Extent {
  const known = props.values.flatMap((item) => (item.value === null ? [] : [item.value]));
  const extra = [props.reference ?? null, props.band?.min ?? null, props.band?.max ?? null].flatMap(
    (value) => (value === null ? [] : [value]),
  );
  const all = [...known, ...extra];
  const max = Math.max(...all);
  if (props.kind === 'bars') {
    return { min: 0, max: max <= 0 ? 1 : max };
  }
  const min = Math.min(...all);
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
  const first = placed[0];
  if (last === undefined || first === undefined) {
    return null;
  }
  const line = linePath(placed);
  const bottom = String(area.height);
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.32} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path
        d={`${line} L${last.x.toFixed(1)} ${bottom} L${first.x.toFixed(1)} ${bottom} Z`}
        fill={`url(#${id})`}
      />
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

function BarMarks({ chart, area, y, grow }: Drawn): ReactNode {
  const fill = useColour(chart.colour);
  const track = useColour('surface-3');
  const slot = area.width / Math.max(1, chart.values.length);
  const width = Math.max(2, slot * (1 - BAR_GAP));
  const radius = Math.min(width / 2, 4);
  const lastIndex = chart.values.length - 1;
  return chart.values.map((item, index) => {
    const x = index * slot + (slot - width) / 2;
    if (item.value === null || item.value <= 0) {
      return (
        <Path
          key={item.key}
          d={roundedTop({ x, y: area.height - STUB, w: width, h: STUB }, 1.5)}
          fill={track}
        />
      );
    }
    const top = Math.min(area.height - STUB, area.height - (area.height - y(item.value)) * grow);
    const reached =
      chart.reference !== undefined && chart.reference !== null && item.value >= chart.reference;
    return (
      <Path
        key={item.key}
        d={roundedTop({ x, y: top, w: width, h: area.height - top }, radius)}
        fill={fill}
        fillOpacity={index === lastIndex || reached ? 1 : 0.45}
      />
    );
  });
}

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function roundedTop({ x, y, w, h }: Slot, r: number): string {
  const radius = Math.min(r, w / 2, h);
  const n = (value: number): string => value.toFixed(1);
  return `M${n(x)} ${n(y + h)} V${n(y + radius)} Q${n(x)} ${n(y)} ${n(x + radius)} ${n(y)} H${n(x + w - radius)} Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + radius)} V${n(y + h)} Z`;
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

function Marks(drawn: Drawn): ReactNode {
  const { chart, area, grow } = drawn;
  if (chart.kind === 'bars') {
    return <BarMarks {...drawn} />;
  }
  const clip = { width: area.width * grow, height: area.height };
  return (
    <View style={clip} className="absolute left-0 top-0 overflow-hidden">
      <Svg width={area.width} height={area.height}>
        <LineMarks chart={chart} area={area} y={drawn.y} />
      </Svg>
    </View>
  );
}

export function FillChart(props: FillChartProps): ReactNode {
  const [area, setArea] = useState<Area | null>(null);
  const grow = useTween(1, !useMotion().reduced);
  const domain = domainOf(props);
  const y =
    area === null
      ? null
      : scaleLinear(domain, {
          min: area.height - (props.kind === 'bars' ? 0 : PAD * 2),
          max: PAD * 2,
        });
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
