import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { EASING } from '../../../design/motion';
import { BLINK, GLOW, SPIN, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId, type Box } from '../parts/frame';
import { useTint } from '../parts/ink';
import { Shine } from '../parts/material';
import { arcPath, circlePath, rounded } from '../parts/shapes';
import type { VisualProps, VisualSize } from '../types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CENTRE = 50;
const RING = { cx: CENTRE, cy: CENTRE, r: 24.5 };
const CIRCUMFERENCE = 2 * Math.PI * RING.r;
const FILL_MS = 1100;

const STEEL = { dark: '#25272B', mid: '#6C7078', light: '#9EA2A9' };
const STRAP = { dark: '#111214', light: '#2A2C30' };
const GLASS = { centre: '#1B1D22', edge: '#040405' };
const DISPLAY = { text: '#F4F3F0', soft: '#A7A9AE' };

const TICKS = Array.from({ length: 12 }, (_, index) => {
  const radians = (index * Math.PI) / 6;
  const inner = index % 3 === 0 ? 30.2 : 31.3;
  const point = (r: number): string =>
    `${(CENTRE + r * Math.sin(radians)).toFixed(2)} ${(CENTRE - r * Math.cos(radians)).toFixed(2)}`;
  return `M${point(inner)} L${point(33)}`;
}).join(' ');

function Strap(): ReactNode {
  const leather = useSvgId('strap');
  return (
    <>
      <Defs>
        <LinearGradient id={leather} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={STRAP.dark} />
          <Stop offset="0.5" stopColor={STRAP.light} />
          <Stop offset="1" stopColor={STRAP.dark} />
        </LinearGradient>
      </Defs>
      <Path d={rounded({ x: 34, y: 0, w: 32, h: 100, r: 7 })} fill={`url(#${leather})`} />
    </>
  );
}

function Case(): ReactNode {
  const steel = useSvgId('steel');
  return (
    <>
      <Defs>
        <LinearGradient id={steel} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={STEEL.light} />
          <Stop offset="0.45" stopColor={STEEL.mid} />
          <Stop offset="1" stopColor={STEEL.dark} />
        </LinearGradient>
      </Defs>
      <Path d={rounded({ x: 84, y: 43, w: 6, h: 14, r: 2.5 })} fill={`url(#${steel})`} />
      <Path d={rounded({ x: 82.5, y: 31, w: 4, h: 7, r: 1.5 })} fill={STEEL.mid} />
      <Circle cx={CENTRE} cy={CENTRE} r={37} fill={`url(#${steel})`} />
      <Shine d={circlePath({ cx: CENTRE, cy: CENTRE, r: 37 })} gloss />
      <Circle cx={CENTRE} cy={CENTRE} r={34} fill={STRAP.dark} />
      <Path d={TICKS} stroke={STEEL.light} strokeWidth={0.7} strokeLinecap="round" />
    </>
  );
}

function Glass(): ReactNode {
  const face = useSvgId('face');
  return (
    <>
      <Defs>
        <RadialGradient id={face} cx="45%" cy="40%" r="60%">
          <Stop offset="0" stopColor={GLASS.centre} />
          <Stop offset="1" stopColor={GLASS.edge} />
        </RadialGradient>
      </Defs>
      <Circle cx={CENTRE} cy={CENTRE} r={29.5} fill={`url(#${face})`} />
    </>
  );
}

function Progress({
  progress,
  colour,
  moving,
}: {
  readonly progress: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const drawn = useSharedValue(moving ? 0 : progress);
  useEffect(() => {
    drawn.set(
      moving ? withTiming(progress, { duration: FILL_MS, easing: EASING.decelerate }) : progress,
    );
  }, [drawn, moving, progress]);
  const animated = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - drawn.get()),
  }));
  return (
    <>
      <Circle
        cx={CENTRE}
        cy={CENTRE}
        r={RING.r}
        fill="none"
        stroke={colour}
        strokeOpacity={0.2}
        strokeWidth={4}
      />
      {progress <= 0 ? (
        <Circle cx={CENTRE} cy={CENTRE - RING.r} r={2} fill={colour} />
      ) : (
        <AnimatedCircle
          cx={CENTRE}
          cy={CENTRE}
          r={RING.r}
          fill="none"
          stroke={colour}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${String(CIRCUMFERENCE)} ${String(CIRCUMFERENCE)}`}
          transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
          animatedProps={animated}
        />
      )}
    </>
  );
}

function BatteryMark({
  level,
  colour,
}: {
  readonly level: number;
  readonly colour: string;
}): ReactNode {
  return (
    <>
      <Path
        d={rounded({ x: 45.5, y: 31.5, w: 9, h: 4, r: 1.2 })}
        fill="none"
        stroke={DISPLAY.soft}
        strokeWidth={0.5}
      />
      <Path
        d={rounded({ x: 46.3, y: 32.3, w: Math.max(0.6, (7.4 * level) / 100), h: 2.4, r: 0.6 })}
        fill={colour}
      />
    </>
  );
}

const READOUT_FONT: Readonly<Record<VisualSize, number>> = { tile: 0, card: 12, hero: 11 };

function Display({
  steps,
  size,
}: {
  readonly steps: string;
  readonly size: VisualSize;
}): ReactNode {
  if (size === 'tile') {
    return null;
  }
  return (
    <>
      <SvgText
        transform={`translate(${String(CENTRE)} ${size === 'hero' ? '52' : '54'})`}
        textAnchor="middle"
        fontFamily="Geist-SemiBold"
        fontSize={READOUT_FONT[size]}
        fill={DISPLAY.text}
      >
        {steps}
      </SvgText>
      {size === 'hero' ? (
        <SvgText
          transform={`translate(${String(CENTRE)} 59.5)`}
          textAnchor="middle"
          fontFamily="Geist-Medium"
          fontSize={4.2}
          fill={DISPLAY.soft}
        >
          steps
        </SvgText>
      ) : null}
    </>
  );
}

const HEART_BOX: Box = { x: 46, y: 62, w: 8, h: 8 };
const HEART =
  'M50 69 C44 65 46 61.5 48.4 62 C49.3 62.2 49.8 62.8 50 63.4 C50.2 62.8 50.7 62.2 51.6 62 C54 61.5 56 65 50 69 Z';

function Pulse({
  bpm,
  moving,
  px,
}: {
  readonly bpm: number;
  readonly moving: boolean;
  readonly px: number;
}): ReactNode {
  const heart = useColour('heart');
  const beat = loopStyle({ name: GLOW, ms: Math.round(30_000 / bpm), alternate: true }, moving);
  return (
    <Layer box={HEART_BOX} px={px} motion={beat}>
      <Canvas px={px} box={HEART_BOX}>
        <Path d={HEART} fill={heart} />
      </Canvas>
    </Layer>
  );
}

function SyncSweep({
  px,
  moving,
  colour,
}: {
  readonly px: number;
  readonly moving: boolean;
  readonly colour: string;
}): ReactNode {
  const spin = loopStyle({ name: SPIN, ms: 1400 }, moving);
  const blink = loopStyle({ name: BLINK, ms: 1400 }, !moving);
  return (
    <Layer box={FULL} px={px} motion={spin ?? blink}>
      <Canvas px={px}>
        <Path
          d={arcPath({ cx: CENTRE, cy: CENTRE, r: 35.5 }, -40, 40)}
          stroke={colour}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
      </Canvas>
    </Layer>
  );
}

function Body({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ring = useTint('stand', tone);
  const charge = useColour(state.battery !== null && state.battery < 20 ? 'warning' : 'positive');
  const { reading, battery } = state;
  return (
    <Layer box={FULL} px={px}>
      <Canvas px={px}>
        <Strap />
        <Case />
        <Glass />
        <Progress progress={state.progress ?? 0} colour={ring} moving={moving} />
        {battery === null || size === 'tile' ? null : (
          <BatteryMark level={battery} colour={charge} />
        )}
        {reading === null ? null : <Display steps={reading.text} size={size} />}
      </Canvas>
    </Layer>
  );
}

export function WatchVisual(props: VisualProps): ReactNode {
  const { state, size, px, moving } = props;
  const sync = useColour('primary');
  const pulse = size === 'tile' ? null : state.pulse;
  return (
    <>
      <Body {...props} />
      {pulse === null || pulse <= 0 ? null : <Pulse bpm={pulse} moving={moving} px={px} />}
      {state.syncing ? <SyncSweep px={px} moving={moving} colour={sync} /> : null}
    </>
  );
}
