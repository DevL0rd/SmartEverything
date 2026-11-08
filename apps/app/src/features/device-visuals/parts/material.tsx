import { createContext, use, type ReactNode } from 'react';
import { Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { useColour } from '../../../design/colour';
import { useSvgId } from './frame';

export const LIGHT = '#FFFFFF';
const SHADE = '#000000';
const FLOOR_MID = 0.45;

export interface Lighting {
  readonly warmth: number;
  readonly shine: number;
  readonly edge: number;
  readonly rim: number;
  readonly floor: number;
}

export const LIGHTING: Readonly<Record<'light' | 'dark', Lighting>> = {
  light: { warmth: 0.12, shine: 0.85, edge: 0.12, rim: 0.95, floor: 0.2 },
  dark: { warmth: 0.07, shine: 0.13, edge: 0.32, rim: 0.28, floor: 0.6 },
};

export const LightingContext = createContext<Lighting>(LIGHTING.dark);

export function LightingScope({ children }: { readonly children: ReactNode }): ReactNode {
  const lighting = useUniwind().theme === 'light' ? LIGHTING.light : LIGHTING.dark;
  return <LightingContext value={lighting}>{children}</LightingContext>;
}

export function Shine({
  d,
  gloss = false,
}: {
  readonly d: string;
  readonly gloss?: boolean;
}): ReactNode {
  const lighting = use(LightingContext);
  const warm = useColour('temp-warm');
  const wash = useSvgId('wash');
  const rim = useSvgId('rim');
  const peak = gloss ? Math.min(1, lighting.shine * 1.4) : lighting.shine;
  return (
    <>
      <LinearGradient id={wash} x1="0" y1="0" x2="1" y2="0">
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
      <Path d={d} fill={`url(#${wash})`} stroke={`url(#${rim})`} strokeWidth={0.9} />
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
  const lighting = use(LightingContext);
  const id = useSvgId('floor');
  return (
    <>
      <RadialGradient id={id} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={SHADE} stopOpacity={lighting.floor} />
        <Stop offset="0.6" stopColor={SHADE} stopOpacity={lighting.floor * FLOOR_MID} />
        <Stop offset="1" stopColor={SHADE} stopOpacity={0} />
      </RadialGradient>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}
