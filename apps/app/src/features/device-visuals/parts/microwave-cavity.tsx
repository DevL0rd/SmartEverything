import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Circle, LinearGradient, Path, Stop } from 'react-native-svg';
import { SPIN, eased, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, Squash, boxStyle, useSvgId } from './frame';
import type { VisualInk } from './ink';
import { CAVITY, WELL } from './microwave-geometry';

const TURN = { name: SPIN, ms: 6000 } as const;
const CAVITY_TOP = 0.45;
const CAVITY_BOTTOM = 0.08;
const PLATE_SQUASH = 0.22;
const PLATE_RATIO = 0.42;

export function CavityLight({
  colour,
  px,
  lit,
  reduced,
}: {
  readonly colour: string;
  readonly px: number;
  readonly lit: boolean;
  readonly reduced: boolean;
}): ReactNode {
  const light = useSvgId('microwave-light');
  const frame: ViewStyle = { ...boxStyle(CAVITY, px), opacity: lit ? 1 : 0 };
  return (
    <Animated.View pointerEvents="none" style={[frame, eased('opacity', reduced)]}>
      <Canvas px={px} box={CAVITY}>
        <LinearGradient id={light} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colour} stopOpacity={CAVITY_TOP} />
          <Stop offset="1" stopColor={colour} stopOpacity={CAVITY_BOTTOM} />
        </LinearGradient>
        <Path d={WELL} fill={`url(#${light})`} />
      </Canvas>
    </Animated.View>
  );
}

export function Turntable({
  ink,
  tint,
  px,
  spinning,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly px: number;
  readonly spinning: boolean;
}): ReactNode {
  const stroke = spinning ? tint : ink.faint;
  return (
    <Squash box={{ x: 20, y: 46, w: 40, h: 40 }} px={px} ratio={PLATE_SQUASH}>
      <Layer box={FULL} px={px * PLATE_RATIO} motion={loopStyle(TURN, spinning)}>
        <Canvas px={px * PLATE_RATIO}>
          <Circle
            cx={50}
            cy={50}
            r={44}
            fill={ink.light}
            fillOpacity={0.18}
            stroke={stroke}
            strokeWidth={1.6}
          />
          <Path d="M50 8V92M8 50H92" stroke={stroke} strokeOpacity={0.45} strokeWidth={1.6} />
        </Canvas>
      </Layer>
    </Squash>
  );
}
