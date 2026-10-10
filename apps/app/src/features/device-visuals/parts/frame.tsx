import type { ReactNode } from 'react';
import { useId } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg from 'react-native-svg';
import type { LoopStyle } from '../../../design/loops';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const FULL: Box = { x: 0, y: 0, w: 100, h: 100 };

export function scaled(units: number, px: number): number {
  return (units * px) / 100;
}

export function boxStyle(box: Box, px: number): ViewStyle {
  return {
    position: 'absolute',
    left: scaled(box.x, px),
    top: scaled(box.y, px),
    width: scaled(box.w, px),
    height: scaled(box.h, px),
  };
}

export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function Canvas({
  px,
  box = FULL,
  children,
}: {
  readonly px: number;
  readonly box?: Box;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Svg
      width={scaled(box.w, px)}
      height={scaled(box.h, px)}
      viewBox={`${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`}
    >
      {children}
    </Svg>
  );
}

export function Layer({
  box,
  px,
  motion,
  children,
}: {
  readonly box: Box;
  readonly px: number;
  readonly motion?: LoopStyle | null;
  readonly children: ReactNode;
}): ReactNode {
  const frame = boxStyle(box, px);
  return (
    <Animated.View pointerEvents="none" style={[frame, motion]}>
      {children}
    </Animated.View>
  );
}

export function Squash({
  box,
  px,
  ratio,
  children,
}: {
  readonly box: Box;
  readonly px: number;
  readonly ratio: number;
  readonly children: ReactNode;
}): ReactNode {
  const frame: ViewStyle = { ...boxStyle(box, px), transform: [{ scaleY: ratio }] };
  return (
    <Animated.View pointerEvents="none" style={frame}>
      {children}
    </Animated.View>
  );
}
