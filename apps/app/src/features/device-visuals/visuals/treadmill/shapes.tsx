import type { ComponentProps, ReactNode } from 'react';
import { G, LinearGradient, Path, Stop, Text } from 'react-native-svg';
import { rounded } from '../../parts/shapes';

type Paint = Omit<ComponentProps<typeof Path>, 'd' | 'x' | 'y'>;

export function Slab({
  x,
  y,
  w,
  h,
  r = 0,
  ...paint
}: Paint & {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
}): ReactNode {
  return <Path d={rounded({ x, y, w, h, r })} {...paint} />;
}

export function Label({
  x,
  y,
  before = '',
  text,
  ...paint
}: Omit<ComponentProps<typeof Text>, 'x' | 'y'> & {
  readonly x: number;
  readonly y: number;
  readonly before?: string;
  readonly text: string;
}): ReactNode {
  return (
    <G transform={`${before} translate(${String(x)} ${String(y)})`}>
      <Text {...paint}>{text}</Text>
    </G>
  );
}

export type Ramp = readonly (readonly [number, string])[];

export function Gradient({
  id,
  stops,
  vertical,
}: {
  readonly id: string;
  readonly stops: Ramp;
  readonly vertical: boolean;
}): ReactNode {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      {stops.map(([offset, colour]) => (
        <Stop key={offset} offset={offset} stopColor={colour} />
      ))}
    </LinearGradient>
  );
}
