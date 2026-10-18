import { createContext, use, type ReactNode } from 'react';
import { Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { useColour } from '../../../design/colour';
import { useSvgId } from './frame';

export const LIGHT = '#FFFFFF';
const SHADE = '#000000';

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

function useLighting(): Lighting {
  return use(LightingContext);
}

export interface ShineIds {
  readonly wash: string;
  readonly rim: string;
}

export function useShineIds(): ShineIds {
  return { wash: useSvgId('wash'), rim: useSvgId('rim') };
}

interface ShineLook {
  readonly ids: ShineIds;
  readonly gloss: boolean;
  readonly vertical: boolean;
  readonly rim: boolean;
}

function shineGradients(lighting: Lighting, warm: string, look: ShineLook): ReactNode {
  const { ids, gloss, vertical } = look;
  const peak = gloss ? Math.min(1, lighting.shine * 1.4) : lighting.shine;
  return (
    <>
      <LinearGradient
        id={ids.wash}
        x1="0"
        y1="0"
        x2={vertical ? '0' : '1'}
        y2={vertical ? '1' : '0'}
      >
        <Stop offset="0" stopColor={warm} stopOpacity={lighting.warmth} />
        <Stop offset={gloss ? '0.3' : '0.22'} stopColor={LIGHT} stopOpacity={0} />
        <Stop offset={gloss ? '0.36' : '0.34'} stopColor={LIGHT} stopOpacity={peak} />
        <Stop offset={gloss ? '0.44' : '0.56'} stopColor={LIGHT} stopOpacity={0} />
        <Stop offset="1" stopColor={SHADE} stopOpacity={lighting.edge} />
      </LinearGradient>
      {look.rim ? (
        <LinearGradient id={ids.rim} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={LIGHT} stopOpacity={lighting.rim} />
          <Stop offset="0.35" stopColor={LIGHT} stopOpacity={0} />
        </LinearGradient>
      ) : null}
    </>
  );
}

export function ShineGradients({
  ids,
  gloss = false,
  vertical = false,
  rim = true,
}: {
  readonly ids: ShineIds;
  readonly gloss?: boolean;
  readonly vertical?: boolean;
  readonly rim?: boolean;
}): ReactNode {
  return shineGradients(useLighting(), useColour('temp-warm'), { ids, gloss, vertical, rim });
}

function shinePath(d: string, ids: ShineIds): ReactNode {
  return <Path d={d} fill={`url(#${ids.wash})`} stroke={`url(#${ids.rim})`} strokeWidth={0.9} />;
}

export function ShinePath({ d, ids }: { readonly d: string; readonly ids: ShineIds }): ReactNode {
  return shinePath(d, ids);
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
  const ids = useShineIds();
  return (
    <>
      {shineGradients(lighting, warm, { ids, gloss, vertical, rim: true })}
      {shinePath(d, ids)}
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
      <RadialGradient id={id} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={SHADE} stopOpacity={lighting.floor} />
        <Stop offset="0.6" stopColor={SHADE} stopOpacity={lighting.floor * 0.45} />
        <Stop offset="1" stopColor={SHADE} stopOpacity={0} />
      </RadialGradient>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}
