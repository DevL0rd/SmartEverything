import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import { StyleSheet, View, processColor } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAnimationGate } from '../design/animation-gate';
import { useColour } from '../design/colour';
import { isNative } from '../design/platform';
import { BREATHE, EASE_IN_OUT, loopStyle, type Loop } from '../design/loops';
import type { ColourRole } from '../design/tokens';
import { useOnScreen } from '../design/visibility';

export interface GlowProps {
  readonly colour: ColourRole;
  readonly x?: string;
  readonly y?: string;
  readonly radius?: string;
  readonly strength?: number;
  readonly breathing?: boolean;
}

const BREATH: Loop = { name: BREATHE, ms: 3200, easing: EASE_IN_OUT, alternate: true };

type GlowArtProps = Required<Omit<GlowProps, 'breathing'>> & { readonly pinned: boolean };

class UnreadableColourError extends Error {
  override readonly name = 'UnreadableColourError';

  constructor(readonly colour: string) {
    super(`The glow colour ${colour} is not a colour React Native can read.`);
  }
}

function faded(colour: string, alpha: number): string {
  const packed = processColor(colour);
  if (typeof packed !== 'number') {
    throw new UnreadableColourError(colour);
  }
  const channel = (shift: number): number => (packed >>> shift) & 0xff;
  const opacity = (channel(24) / 0xff) * alpha;
  return `rgba(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))}, ${String(opacity)})`;
}

function NativeGlow({ colour, x, y, radius, strength }: GlowArtProps): ReactNode {
  const fill = useColour(colour);
  const stops = [
    `${faded(fill, strength)} 0%`,
    `${faded(fill, strength / 3)} 60%`,
    `${faded(fill, 0)} 100%`,
  ].join(', ');
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          experimental_backgroundImage: `radial-gradient(ellipse ${radius} ${radius} at ${x} ${y}, ${stops})`,
        },
      ]}
    />
  );
}

function SvgGlow({ colour, x, y, radius, strength, pinned }: GlowArtProps): ReactNode {
  const fill = useColour(colour);
  const id = `glow-${useId().replaceAll(':', '')}`;
  return (
    <Svg
      width="100%"
      height="100%"
      {...(pinned ? { style: StyleSheet.absoluteFill, pointerEvents: 'none' as const } : {})}
    >
      <RadialGradient id={id} cx={x} cy={y} r={radius}>
        <Stop offset="0" stopColor={fill} stopOpacity={strength} />
        <Stop offset="0.6" stopColor={fill} stopOpacity={strength / 3} />
        <Stop offset="1" stopColor={fill} stopOpacity={0} />
      </RadialGradient>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function GlowArt({
  colour,
  x = '50%',
  y = '42%',
  radius = '62%',
  strength = 0.3,
  pinned = false,
}: GlowProps & { readonly pinned?: boolean }): ReactNode {
  const art = { colour, x, y, radius, strength, pinned };
  return isNative() ? <NativeGlow {...art} /> : <SvgGlow {...art} />;
}

function BreathingGlow(props: GlowProps): ReactNode {
  const ref = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(ref);
  const { moving } = useAnimationGate(true, visible);
  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="none" className="absolute inset-0">
      <Animated.View
        className="absolute inset-0"
        renderToHardwareTextureAndroid
        style={loopStyle(BREATH, moving)}
      >
        <GlowArt {...props} />
      </Animated.View>
    </View>
  );
}

export function Glow(props: GlowProps): ReactNode {
  if (props.breathing === true) return <BreathingGlow {...props} />;
  return <GlowArt {...props} pinned />;
}
