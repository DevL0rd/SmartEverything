import type { InclineScale } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { arcPath, pointOn, type Ring } from '../../../components/charts/geometry';
import { LiveFigure } from '../../../components/live-figure';
import { useColour } from '../../../design/colour';
import { decimal } from '../../../format/number';
import {
  FAN_DEGREES,
  fanAngle,
  inclineLabel,
  inclineTicks,
  unitWord,
  type InclineRange,
} from '../model/incline-model';

const PAD = 10;
const LABEL_PX = 11;
const FLAT_BEARING = 90;
const TICK_SHORT = 5;
const TICK_LONG = 9;
const TRACK_WIDTH = 3;
const KNOB = 5;
const LABELLED = 10;

export interface InclineGaugeProps {
  readonly value: number;
  readonly target: number | null;
  readonly cap: number | null;
  readonly scale: InclineScale;
  readonly range: InclineRange;
  readonly width: number;
}

function bearingOf(value: number, range: InclineRange): number {
  return FLAT_BEARING - fanAngle(value, range);
}

function Ticks({ ring, range }: { readonly ring: Ring; readonly range: InclineRange }): ReactNode {
  const stroke = useColour('on-surface-variant');
  return inclineTicks(range).map((tick) => {
    const long = tick % LABELLED === 0;
    const bearing = bearingOf(tick, range);
    const outer = pointOn(ring, bearing);
    const inner = pointOn({ ...ring, r: ring.r - (long ? TICK_LONG : TICK_SHORT) }, bearing);
    const label = pointOn({ ...ring, r: ring.r + LABEL_PX }, bearing);
    return (
      <G key={tick}>
        <Line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke={stroke}
          strokeWidth={1.5}
        />
        {long ? (
          <SvgText
            transform={[{ translateX: label.x }, { translateY: label.y + LABEL_PX / 3 }]}
            fill={stroke}
            fontSize={LABEL_PX}
            textAnchor="middle"
          >
            {decimal(tick, 0)}
          </SvgText>
        ) : null}
      </G>
    );
  });
}

function Needle({
  ring,
  value,
  range,
}: {
  readonly ring: Ring;
  readonly value: number;
  readonly range: InclineRange;
}): ReactNode {
  const fill = useColour('viz-violet');
  const knob = useColour('on-surface');
  const tip = pointOn({ ...ring, r: ring.r - TICK_LONG - 2 }, bearingOf(value, range));
  const flat = pointOn({ ...ring, r: ring.r - TICK_LONG - 2 }, FLAT_BEARING);
  const wedge = `M${String(ring.cx)} ${String(ring.cy)} L${String(flat.x)} ${String(flat.y)} A${String(ring.r - TICK_LONG - 2)} ${String(ring.r - TICK_LONG - 2)} 0 0 0 ${String(tip.x)} ${String(tip.y)} Z`;
  return (
    <>
      <Path d={wedge} fill={fill} fillOpacity={0.22} />
      <Line
        x1={ring.cx}
        y1={ring.cy}
        x2={tip.x}
        y2={tip.y}
        stroke={fill}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={tip.x} cy={tip.y} r={KNOB} fill={knob} stroke={fill} strokeWidth={2} />
    </>
  );
}

function Marker({
  ring,
  value,
  range,
  colour,
}: {
  readonly ring: Ring;
  readonly value: number;
  readonly range: InclineRange;
  readonly colour: 'on-surface' | 'caution';
}): ReactNode {
  const stroke = useColour(colour);
  const bearing = bearingOf(value, range);
  const outer = pointOn({ ...ring, r: ring.r + 4 }, bearing);
  const inner = pointOn({ ...ring, r: ring.r - TICK_LONG - 4 }, bearing);
  return (
    <Line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke={stroke}
      strokeWidth={3}
      strokeDasharray="3 2"
    />
  );
}

function Fan({
  ring,
  range,
  value,
  target,
  cap,
}: {
  readonly ring: Ring;
  readonly range: InclineRange;
  readonly value: number;
  readonly target: number | null;
  readonly cap: number | null;
}): ReactNode {
  const track = useColour('outline');
  return (
    <>
      <Line
        x1={ring.cx}
        y1={ring.cy}
        x2={ring.cx + ring.r}
        y2={ring.cy}
        stroke={track}
        strokeWidth={TRACK_WIDTH}
      />
      <Path
        d={arcPath(ring, FLAT_BEARING - FAN_DEGREES, FLAT_BEARING)}
        fill="none"
        stroke={track}
        strokeWidth={TRACK_WIDTH}
      />
      <Ticks ring={ring} range={range} />
      <Needle ring={ring} value={value} range={range} />
      {target === null || target === value ? null : (
        <Marker ring={ring} value={target} range={range} colour="on-surface" />
      )}
      {cap === null ? null : <Marker ring={ring} value={cap} range={range} colour="caution" />}
    </>
  );
}

export function InclineGauge({
  value,
  target,
  cap,
  scale,
  range,
  width,
}: InclineGaugeProps): ReactNode {
  const radius = width - PAD * 2 - LABEL_PX;
  const height = Math.round(radius * Math.sin((FAN_DEGREES * Math.PI) / 180)) + PAD * 2 + LABEL_PX;
  const ring: Ring = { cx: PAD, cy: height - PAD, r: radius };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={inclineLabel(value, scale, target)}
      className="flex-row items-start gap-1"
    >
      <Svg width={width} height={height}>
        <Fan ring={ring} range={range} value={value} target={target} cap={cap} />
      </Svg>
      <View>
        <LiveFigure
          value={decimal(value, 0)}
          unit={unitWord(scale)}
          size="l"
          align="start"
          widest={decimal(range.max, 0)}
        />
      </View>
    </View>
  );
}
