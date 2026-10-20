import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { shadeAt, type DrawnShades } from './draw-shades';
import { arcLength, arcPath, pointOn, type XY } from './geometry';

export { angleAt, polar } from './geometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ArcTick {
  readonly start: number;
  readonly sweep: number;
  readonly colour: ColourRole;
  readonly thickness: number;
}

export interface ArcProps {
  readonly value: number;
  readonly size: number;
  readonly thickness: number;
  readonly colour: ColourRole;
  readonly trackColour?: ColourRole | null;
  readonly startAngle?: number;
  readonly sweep?: number;
  readonly tinted?: boolean;
  readonly ticks?: readonly ArcTick[];
  readonly overlay?: boolean;
}

function ArcStroke({
  d,
  colour,
  thickness,
  opacity = 1,
}: {
  readonly d: string;
  readonly colour: ColourRole;
  readonly thickness: number;
  readonly opacity?: number;
}): ReactNode {
  const stroke = useColour(colour);
  return (
    <Path
      d={d}
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  );
}

function StartDot({
  at,
  colour,
  thickness,
  drawn,
}: {
  readonly at: XY;
  readonly colour: ColourRole;
  readonly thickness: number;
  readonly drawn: SharedValue<number>;
}): ReactNode {
  const animated = useAnimatedProps(() => ({ opacity: drawn.get() > 0 ? 0 : 1 }));
  return (
    <AnimatedCircle
      cx={at.x}
      cy={at.y}
      r={thickness / 2}
      fill={useColour(colour)}
      animatedProps={animated}
    />
  );
}

export function DrawnStroke({
  d,
  length,
  shades,
  thickness,
  drawn,
}: {
  readonly d: string;
  readonly length: number;
  readonly shades: DrawnShades;
  readonly thickness: number;
  readonly drawn: SharedValue<number>;
}): ReactNode {
  const animated = useAnimatedProps(() => {
    const share = drawn.get();
    return {
      strokeDashoffset: length * (1 - share),
      strokeOpacity: share > 0 ? 1 : 0,
      stroke: shadeAt(shades, share),
    };
  }, [length, shades]);
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={shades[0].colour}
      strokeWidth={thickness}
      strokeLinecap="round"
      strokeDasharray={`${String(length)} ${String(length)}`}
      animatedProps={animated}
    />
  );
}

function trackOf(
  colour: ColourRole,
  track: ColourRole,
  tinted: boolean,
): { readonly colour: ColourRole; readonly opacity: number } {
  return tinted ? { colour, opacity: 0.2 } : { colour: track, opacity: 1 };
}

function Ticks({
  ticks,
  ring,
}: {
  readonly ticks: readonly ArcTick[];
  readonly ring: Parameters<typeof arcPath>[0];
}): ReactNode {
  return ticks.map((tick, index) => (
    <ArcStroke
      key={`${String(index)}-${String(tick.start)}-${String(tick.sweep)}`}
      d={arcPath(ring, tick.start, tick.start + tick.sweep)}
      colour={tick.colour}
      thickness={tick.thickness}
    />
  ));
}

export function Arc({
  value,
  size,
  thickness,
  colour,
  trackColour = 'surface-3',
  startAngle = 0,
  sweep = 360,
  tinted = false,
  ticks = [],
  overlay = false,
}: ArcProps): ReactNode {
  const centre = size / 2;
  const radius = (size - thickness) / 2;
  const target = Math.min(1, Math.max(0, value));
  const drawn = useDraw(target, !useMotion().reduced);
  const stroke = useColour(colour);
  const ring = { cx: centre, cy: centre, r: radius };
  const path = arcPath(ring, startAngle, startAngle + sweep);
  return (
    <Svg
      width={size}
      height={size}
      aria-hidden
      {...(overlay ? { style: StyleSheet.absoluteFill, pointerEvents: 'none' as const } : {})}
    >
      {trackColour === null ? null : (
        <ArcStroke d={path} {...trackOf(colour, trackColour, tinted)} thickness={thickness} />
      )}
      <DrawnStroke
        d={path}
        length={arcLength(radius, sweep)}
        shades={[{ through: Number.POSITIVE_INFINITY, colour: stroke }]}
        thickness={thickness}
        drawn={drawn}
      />
      <Ticks ticks={ticks} ring={ring} />
      {tinted ? (
        <StartDot
          at={pointOn(ring, startAngle)}
          colour={colour}
          thickness={thickness}
          drawn={drawn}
        />
      ) : null}
    </Svg>
  );
}
