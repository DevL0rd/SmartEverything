import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { clock } from '../../../format/time';
import { useDeviceSeries } from '../../../queries/history';
import { useMinute } from '../../../store/clock';
import { usePhoneBattery } from '../data/phone-history';
import { batteryShapeOf, chartSummary, type BatteryShape } from '../model/battery-shape';

const AREA_OPACITY = 0.16;
const BAND_OPACITY = 0.16;
const STALE_OPACITY = 0.4;
const DAY_HOURS = 24;
const AXIS = ['−24 h', '−12 h', 'now'] as const;

function heightOf(height: number, stale: boolean): ViewStyle {
  return { height, opacity: stale ? STALE_OPACITY : 1 };
}

function seriesColour(low: boolean, stale: boolean): 'on-surface-faint' | 'warning' | 'viz-1' {
  if (stale) return 'on-surface-faint';
  return low ? 'warning' : 'viz-1';
}

export function BatterySpark({
  deviceId,
  low,
  stale,
  height,
}: {
  readonly deviceId: string;
  readonly low: boolean;
  readonly stale: boolean;
  readonly height: number;
}): ReactNode {
  const points = useDeviceSeries(deviceId, 'battery', DAY_HOURS).data;
  const frame = heightOf(height, stale);
  if (points === undefined || points.length < 2) return <View style={frame} />;
  return (
    <View style={frame} aria-hidden>
      <Sparkline
        points={points}
        colour={seriesColour(low, stale)}
        height={height}
        area
        domain={[0, 100]}
      />
    </View>
  );
}

function Bands({
  shape,
  height,
  colour,
}: {
  readonly shape: BatteryShape;
  readonly height: number;
  readonly colour: string;
}): ReactNode {
  return shape.bands.map((band) => (
    <Path
      key={band.x}
      d={`M${String(band.x)} 0h${String(band.width)}v${String(height)}h${String(-band.width)}Z`}
      fill={colour}
      fillOpacity={BAND_OPACITY}
    />
  ));
}

function Curves({
  shape,
  colour,
}: {
  readonly shape: BatteryShape;
  readonly colour: string;
}): ReactNode {
  return shape.lines.map((entry) => (
    <Path
      key={entry.line}
      d={entry.line}
      fill="none"
      stroke={colour}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ));
}

function Fills({
  shape,
  colour,
}: {
  readonly shape: BatteryShape;
  readonly colour: string;
}): ReactNode {
  return shape.lines.map((entry) => (
    <Path key={entry.area} d={entry.area} fill={colour} fillOpacity={AREA_OPACITY} />
  ));
}

function Marks({
  shape,
  width,
  stroke,
}: {
  readonly shape: BatteryShape;
  readonly width: number;
  readonly stroke: string;
}): ReactNode {
  const rule = useColour('on-surface-variant');
  const ring = useColour('surface-1');
  return (
    <>
      <Line
        x1={0}
        x2={width}
        y1={shape.lowY}
        y2={shape.lowY}
        stroke={rule}
        strokeOpacity={0.6}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <Curves shape={shape} colour={stroke} />
      {shape.end === null ? null : (
        <Circle
          cx={shape.end.x}
          cy={shape.end.y}
          r={4}
          fill={stroke}
          stroke={ring}
          strokeWidth={2}
        />
      )}
    </>
  );
}

function Plot({
  width,
  height,
  deviceId,
  low,
  stale,
}: {
  readonly width: number;
  readonly height: number;
  readonly deviceId: string;
  readonly low: boolean;
  readonly stale: boolean;
}): ReactNode {
  const now = useMinute();
  const battery = usePhoneBattery(deviceId, '24h', now);
  const stroke = useColour(seriesColour(low, stale));
  const positive = useColour('positive');
  const points = battery.points ?? [];
  const spans = battery.charging ?? [];
  const shape = batteryShapeOf(points, spans, { width, height }, now);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={chartSummary(points, spans, (moment) => clock(moment))}
      style={heightOf(height, stale)}
    >
      <Svg width={width} height={height}>
        <Bands shape={shape} height={height} colour={positive} />
        <Fills shape={shape} colour={stroke} />
        <Marks shape={shape} width={width} stroke={stroke} />
      </Svg>
    </View>
  );
}

export function BatteryChart({
  deviceId,
  low,
  stale,
  height,
}: {
  readonly deviceId: string;
  readonly low: boolean;
  readonly stale: boolean;
  readonly height: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View className="min-w-0 flex-1 gap-1" onLayout={onLayout} pointerEvents="none">
      {width > 0 ? (
        <Plot width={width} height={height} deviceId={deviceId} low={low} stale={stale} />
      ) : (
        <View style={heightOf(height, false)} />
      )}
      <View className="flex-row justify-between" aria-hidden>
        {AXIS.map((label) => (
          <Text key={label} variant="caption" tone="variant" className="tabular">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
