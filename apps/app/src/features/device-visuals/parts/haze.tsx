import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { Ellipse } from 'react-native-svg';
import { faded } from '../../../design/faded';
import type { LoopStyle } from '../../../design/loops';
import { isNative } from '../../../design/platform';
import { Canvas, FULL, Layer, useSvgId, type LayerLook } from './frame';
import { GlowGradient } from './ink';

export interface Blob {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export const DISC: Blob = { cx: 50, cy: 50, rx: 50, ry: 50 };

export function hazeFill(blob: Blob, colour: string, strength: number): ViewStyle {
  const { cx, cy, rx, ry } = blob;
  const stops = `${faded(colour, strength)} 0%, ${faded(colour, 0)} 100%`;
  return {
    experimental_backgroundImage: `radial-gradient(ellipse ${String(rx)}% ${String(ry)}% at ${String(cx)}% ${String(cy)}%, ${stops})`,
  };
}

function SvgBlob({
  px,
  blob,
  colour,
  strength,
}: {
  readonly px: number;
  readonly blob: Blob;
  readonly colour: string;
  readonly strength: number;
}): ReactNode {
  const id = useSvgId('haze');
  return (
    <Canvas px={px}>
      <GlowGradient id={id} colour={colour} strength={strength} />
      <Ellipse cx={blob.cx} cy={blob.cy} rx={blob.rx} ry={blob.ry} fill={`url(#${id})`} />
    </Canvas>
  );
}

export function Haze({
  px,
  blob,
  colour,
  strength = 0.55,
  motion = null,
  style,
}: {
  readonly px: number;
  readonly blob: Blob;
  readonly colour: string;
  readonly strength?: number;
  readonly motion?: LoopStyle | null;
  readonly style?: LayerLook;
}): ReactNode {
  const native = isNative();
  return (
    <Layer
      box={FULL}
      px={px}
      motion={motion}
      look={[native ? hazeFill(blob, colour, strength) : null, style]}
    >
      {native ? null : <SvgBlob px={px} blob={blob} colour={colour} strength={strength} />}
    </Layer>
  );
}
