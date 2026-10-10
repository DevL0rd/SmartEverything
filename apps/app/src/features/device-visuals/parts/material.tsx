import type { ReactNode } from 'react';
import { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { useColour } from '../../../design/colour';
import { useSvgId } from './frame';

export const LIGHT = '#FFFFFF';
const SHADE = '#000000';

interface Lighting {
  readonly warmth: number;
  readonly shine: number;
  readonly edge: number;
  readonly rim: number;
  readonly floor: number;
}

const LIGHTING: Readonly<Record<'light' | 'dark', Lighting>> = {
  light: { warmth: 0.12, shine: 0.85, edge: 0.12, rim: 0.95, floor: 0.2 },
  dark: { warmth: 0.07, shine: 0.13, edge: 0.32, rim: 0.28, floor: 0.6 },
};

function useLighting(): Lighting {
  return useUniwind().theme === 'light' ? LIGHTING.light : LIGHTING.dark;
}

export function Shine({
  d,
  gloss = false,
  vertical = false,
}: {
  readonly d: string;
  readonly gloss?: boolean;
  readonly vertical?: boolean;
}): ReactNode {
  const lighting = useLighting();
  const warm = useColour('temp-warm');
  const wash = useSvgId('wash');
  const rim = useSvgId('rim');
  const peak = gloss ? Math.min(1, lighting.shine * 1.4) : lighting.shine;
  return (
    <>
      <Defs>
        <LinearGradient id={wash} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
          <Stop offset="0" stopColor={warm} stopOpacity={lighting.warmth} />
          <Stop offset={gloss ? '0.3' : '0.22'} stopColor={LIGHT} stopOpacity={0} />
          <Stop offset={gloss ? '0.36' : '0.34'} stopColor={LIGHT} stopOpacity={peak} />
          <Stop offset={gloss ? '0.44' : '0.56'} stopColor={LIGHT} stopOpacity={0} />
          <Stop offset="1" stopColor={SHADE} stopOpacity={lighting.edge} />
        </LinearGradient>
        <LinearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={LIGHT} stopOpacity={lighting.rim} />
          <Stop offset="0.35" stopColor={LIGHT} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill={`url(#${wash})`} />
      <Path d={d} fill="none" stroke={`url(#${rim})`} strokeWidth={0.9} />
    </>
  );
}

export function ContactShadow({
  cx,
  cy,
  rx,
  ry,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}): ReactNode {
  const lighting = useLighting();
  const id = useSvgId('floor');
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={SHADE} stopOpacity={lighting.floor} />
          <Stop offset="0.6" stopColor={SHADE} stopOpacity={lighting.floor * 0.45} />
          <Stop offset="1" stopColor={SHADE} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}
