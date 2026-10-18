import type { ReactNode } from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
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
  colour,
  thickness,
  drawn,
  after = 0,
  through = Number.POSITIVE_INFINITY,
}: {
  readonly d: string;
  readonly length: number;
  readonly colour: ColourRole;
  readonly thickness: number;
  readonly drawn: SharedValue<number>;
  readonly after?: number;
  readonly through?: number;
}): ReactNode {
  const stroke = useColour(colour);
  const animated = useAnimatedProps(
    () => ({
      strokeDashoffset: length * (1 - drawn.get()),
      strokeOpacity: drawn.get() > after && drawn.get() <= through ? 1 : 0,
    }),
    [length, after, through],
  );
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={stroke}
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
}: ArcProps): ReactNode {
  const centre = size / 2;
  const radius = (size - thickness) / 2;
  const target = Math.min(1, Math.max(0, value));
  const drawn = useDraw(target, !useMotion().reduced);
  const ring = { cx: centre, cy: centre, r: radius };
  const path = arcPath(ring, startAngle, startAngle + sweep);
  return (
    <Svg width={size} height={size} aria-hidden>
      {trackColour === null ? null : (
        <ArcStroke d={path} {...trackOf(colour, trackColour, tinted)} thickness={thickness} />
      )}
      <DrawnStroke
        d={path}
        length={arcLength(radius, sweep)}
        colour={colour}
        thickness={thickness}
        drawn={drawn}
      />
      {ticks.map((tick) => (
        <ArcStroke
          key={`${String(tick.start)}-${tick.colour}`}
          d={arcPath(ring, tick.start, tick.start + tick.sweep)}
          colour={tick.colour}
          thickness={tick.thickness}
        />
      ))}
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
