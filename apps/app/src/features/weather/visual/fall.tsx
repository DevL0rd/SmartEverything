import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { css, type CSSKeyframesRule } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Layer, rounded, scaled, type Box } from '../../device-visuals';
import { BLINK, loopStyle, sway } from '../../../design/loops';

const SPREAD: readonly number[] = [0.08, 0.62, 0.3, 0.86, 0.46, 0.18, 0.74];

const falls = new Map<number, CSSKeyframesRule>();

function fall(distance: number): CSSKeyframesRule {
  const travel = Math.round(distance);
  const known = falls.get(travel);
  if (known !== undefined) {
    return known;
  }
  const made = css.keyframes({
    '0%': { opacity: 0, transform: [{ translateY: 0 }] },
    '20%': { opacity: 1 },
    '80%': { opacity: 1 },
    '100%': { opacity: 0, transform: [{ translateY: travel }] },
  });
  falls.set(travel, made);
  return made;
}

const FLASH = css.keyframes({
  '0%': { opacity: 0 },
  '86%': { opacity: 0 },
  '88%': { opacity: 1 },
  '91%': { opacity: 0.2 },
  '94%': { opacity: 1 },
  '100%': { opacity: 0 },
});

export interface Shower {
  readonly box: Box;
  readonly count: number;
  readonly kind: 'rain' | 'snow';
  readonly ms: number;
}

function dropStyle(shower: Shower, index: number, px: number, colour: string): ViewStyle {
  const snow = shower.kind === 'snow';
  const width = scaled(snow ? 4.5 : 1.8, px);
  const height = scaled(snow ? 4.5 : 7, px);
  const x = shower.box.x + (SPREAD[index % SPREAD.length] ?? 0) * shower.box.w;
  return {
    position: 'absolute',
    left: scaled(x, px) - width / 2,
    top: scaled(shower.box.y, px),
    width,
    height,
    borderRadius: width,
    backgroundColor: colour,
  };
}

export function Drops({
  shower,
  px,
  colour,
  moving,
}: {
  readonly shower: Shower;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  return Array.from({ length: shower.count }, (_, index) => {
    const motion = loopStyle(
      {
        name: fall(scaled(shower.box.h, px)),
        ms: shower.ms,
        easing: shower.kind === 'snow' ? 'ease-in-out' : 'linear',
        delay: Math.round((shower.ms / shower.count) * index),
      },
      moving,
    );
    const still: ViewStyle = {
      transform: [{ translateY: scaled(((index % 3) * shower.box.h) / 3, px) }],
      opacity: 0.85,
    };
    return (
      <Animated.View
        key={index}
        pointerEvents="none"
        style={[dropStyle(shower, index, px, colour), moving ? { opacity: 0 } : still, motion]}
      />
    );
  });
}

export function Bolt({
  box,
  px,
  colour,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  return (
    <Layer box={box} px={px} motion={loopStyle({ name: FLASH, ms: 4600 }, moving)}>
      <Svg width="100%" height="100%" viewBox="0 0 20 32">
        <Path d="M12 0 L2 18 H9 L6 32 L18 11 H11 L14 0 Z" fill={colour} />
      </Svg>
    </Layer>
  );
}

export function Mist({
  box,
  px,
  colour,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const bars = [0, 1, 2];
  return bars.map((bar) => (
    <Layer
      key={bar}
      box={{ ...box, y: box.y + bar * (box.h / 3) }}
      px={px}
      motion={loopStyle(
        {
          name: sway(scaled(6 + bar * 3, px)),
          ms: 5200 + bar * 1300,
          alternate: true,
          easing: 'ease-in-out',
        },
        moving,
      )}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 10">
        <Path
          d={rounded({ x: bar * 8, y: 2, w: 84 - bar * 10, h: 5, r: 2.5 })}
          fill={colour}
          opacity={0.75 - bar * 0.15}
        />
      </Svg>
    </Layer>
  ));
}

export function Twinkle({
  px,
  colour,
  moving,
}: {
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const stars: readonly (readonly [number, number])[] = [
    [18, 22],
    [82, 30],
    [70, 12],
  ];
  return stars.map(([x, y], index) => (
    <Layer
      key={`${String(x)}-${String(y)}`}
      box={{ x: x - 3, y: y - 3, w: 6, h: 6 }}
      px={px}
      motion={loopStyle(
        { name: BLINK, ms: 2600, delay: index * 700, easing: 'ease-in-out' },
        moving,
      )}
    >
      <Svg width="100%" height="100%" viewBox="0 0 10 10">
        <Path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill={colour} />
      </Svg>
    </Layer>
  ));
}
