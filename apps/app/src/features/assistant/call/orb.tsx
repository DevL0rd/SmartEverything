import type { ReactNode } from 'react';
import { useId } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useForeground } from '../../../design/animation-gate';
import { useColour } from '../../../design/colour';
import {
  BREATHE,
  EASE_IN_OUT,
  GLOW,
  RING,
  SPIN,
  loopStyle,
  type Loop,
} from '../../../design/loops';
import { useMotion } from '../../../design/motion';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface AssistantOrbProps {
  readonly state: OrbState;
  readonly level?: SharedValue<number> | number;
  readonly size: number;
  readonly dimmed?: boolean;
}

interface OrbMotion {
  readonly swirl: Loop;
  readonly pulse: Loop;
  readonly halo: Loop | null;
}

const MOTION: Readonly<Record<OrbState, OrbMotion>> = {
  idle: {
    swirl: { name: SPIN, ms: 9000 },
    pulse: { name: GLOW, ms: 2600, easing: EASE_IN_OUT, alternate: true },
    halo: null,
  },
  listening: {
    swirl: { name: SPIN, ms: 6000 },
    pulse: { name: GLOW, ms: 1600, easing: EASE_IN_OUT, alternate: true },
    halo: { name: RING, ms: 1800, easing: 'ease-out' },
  },
  thinking: {
    swirl: { name: SPIN, ms: 1400 },
    pulse: { name: BREATHE, ms: 900, easing: EASE_IN_OUT, alternate: true },
    halo: null,
  },
  speaking: {
    swirl: { name: SPIN, ms: 3500 },
    pulse: { name: GLOW, ms: 700, easing: EASE_IN_OUT, alternate: true },
    halo: { name: RING, ms: 1200, easing: 'ease-out' },
  },
};

interface PaintProps {
  readonly size: number;
  readonly id: string;
  readonly dimmed: boolean;
}

function Sphere({ size, id, dimmed }: PaintProps): ReactNode {
  const core = useColour(dimmed ? 'on-surface-faint' : 'primary');
  const deep = useColour(dimmed ? 'surface-3' : 'primary-container');
  const shine = useColour(dimmed ? 'surface-2' : 'on-primary');
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`${id}-core`} cx="38%" cy="32%" r="72%">
          <Stop offset="0" stopColor={shine} stopOpacity={0.55} />
          <Stop offset="0.28" stopColor={core} stopOpacity={1} />
          <Stop offset="1" stopColor={deep} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${id}-core)`} />
    </Svg>
  );
}

function Swirl({ size, id, dimmed }: PaintProps): ReactNode {
  const teal = useColour(dimmed ? 'on-surface-faint' : 'viz-1');
  const violet = useColour(dimmed ? 'on-surface-variant' : 'viz-4');
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`${id}-a`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={teal} stopOpacity={0.85} />
          <Stop offset="1" stopColor={teal} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-b`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={violet} stopOpacity={0.75} />
          <Stop offset="1" stopColor={violet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r * 1.35} cy={r * 0.7} r={r * 0.62} fill={`url(#${id}-a)`} />
      <Circle cx={r * 0.62} cy={r * 1.38} r={r * 0.56} fill={`url(#${id}-b)`} />
    </Svg>
  );
}

function Halo({
  size,
  loop,
  moving,
}: {
  readonly size: number;
  readonly loop: Loop | null;
  readonly moving: boolean;
}): ReactNode {
  if (loop === null || !moving) {
    return null;
  }
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 rounded-full border-2 border-primary"
      style={[{ width: size, height: size }, loopStyle(loop, moving)]}
    />
  );
}

export function AssistantOrb({ state, level, size, dimmed = false }: AssistantOrbProps): ReactNode {
  const { reduced } = useMotion();
  const foreground = useForeground();
  const moving = !reduced && foreground && !dimmed;
  const id = `orb-${useId().replaceAll(':', '')}`;
  const motion = MOTION[state];
  const target = useDerivedValue(() => {
    const raw = level === undefined ? 0 : typeof level === 'number' ? level : level.get();
    return reduced ? 1 : 1 + Math.min(1, Math.max(0, raw)) * 0.14;
  });
  const levelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(target.get(), { damping: 14, stiffness: 220 }) }],
  }));
  const box = { width: size, height: size };
  return (
    <View
      pointerEvents="none"
      style={box}
      className={dimmed ? 'items-center justify-center opacity-50' : 'items-center justify-center'}
    >
      <Halo size={size} loop={motion.halo} moving={moving} />
      <Animated.View style={[box, levelStyle]}>
        <Animated.View
          style={[box, loopStyle(motion.pulse, moving)]}
          className="overflow-hidden rounded-full"
        >
          <Sphere size={size} id={id} dimmed={dimmed} />
          <Animated.View
            style={[box, loopStyle(motion.swirl, moving)]}
            className="absolute inset-0"
          >
            <Swirl size={size} id={id} dimmed={dimmed} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
