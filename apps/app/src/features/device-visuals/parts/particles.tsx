import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs } from 'react-native-svg';
import { loopStyle, rise, type LoopStyle } from '../../../design/loops';
import { scaled, useSvgId } from './frame';
import { GlowGradient } from './ink';

export interface Emitter {
  readonly x: number;
  readonly y: number;
  readonly spread: number;
  readonly travel: number;
  readonly size: number;
  readonly count: number;
  readonly ms: number;
}

const OFFSETS: readonly number[] = [0, -0.7, 0.55, -0.3, 0.85, 0.2];

function slotOf(emitter: Emitter, index: number, px: number): ViewStyle {
  const offset = OFFSETS[index % OFFSETS.length] ?? 0;
  const size = scaled(emitter.size, px);
  return {
    position: 'absolute',
    left: scaled(emitter.x + offset * emitter.spread, px) - size / 2,
    top: scaled(emitter.y, px) - size / 2,
    width: size,
    height: size,
    opacity: 0,
  };
}

function motionOf(emitter: Emitter, index: number, px: number): LoopStyle | null {
  return loopStyle(
    {
      name: rise(scaled(emitter.travel, px)),
      ms: emitter.ms,
      easing: 'ease-out',
      delay: Math.round((emitter.ms / emitter.count) * index),
    },
    true,
  );
}

function indexes(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index);
}

export function Dots({
  emitter,
  px,
  colour,
}: {
  readonly emitter: Emitter;
  readonly px: number;
  readonly colour: string;
}): ReactNode {
  return indexes(emitter.count).map((index) => {
    const slot: ViewStyle = {
      ...slotOf(emitter, index, px),
      borderRadius: scaled(emitter.size, px),
      backgroundColor: colour,
    };
    return (
      <Animated.View
        key={index}
        pointerEvents="none"
        style={[slot, motionOf(emitter, index, px)]}
      />
    );
  });
}

function Puff({ colour }: { readonly colour: string }): ReactNode {
  const id = useSvgId('puff');
  return (
    <Svg width="100%" height="100%" viewBox="0 0 10 10">
      <Defs>
        <GlowGradient id={id} colour={colour} strength={0.6} />
      </Defs>
      <Circle cx={5} cy={5} r={5} fill={`url(#${id})`} />
    </Svg>
  );
}

export function Puffs({
  emitter,
  px,
  colour,
}: {
  readonly emitter: Emitter;
  readonly px: number;
  readonly colour: string;
}): ReactNode {
  return indexes(emitter.count).map((index) => (
    <Animated.View
      key={index}
      pointerEvents="none"
      style={[slotOf(emitter, index, px), motionOf(emitter, index, px)]}
    >
      <Puff colour={colour} />
    </Animated.View>
  ));
}
