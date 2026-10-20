import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { eased } from '../../../design/loops';
import { Canvas, useSvgId } from '../parts/frame';
import { Haze, type Blob } from '../parts/haze';
import { BodyGradient, useInk, WELL, type VisualInk } from '../parts/ink';
import { circlePath, rounded } from '../parts/shapes';
import { ShineGradients, ShinePath, useShineIds, type ShineIds } from '../parts/material';
import type { VisualProps } from '../types';

const HALO: Blob = { cx: 50, cy: 46, rx: 46, ry: 46 };
const HALO_STRENGTH = 0.75;

function Halo({
  px,
  colour,
  strength,
  reduced,
}: {
  readonly px: number;
  readonly colour: string;
  readonly strength: number;
  readonly reduced: boolean;
}): ReactNode {
  return (
    <Haze
      px={px}
      blob={HALO}
      colour={colour}
      strength={HALO_STRENGTH}
      style={[{ opacity: strength }, eased('opacity', reduced)]}
    />
  );
}

const GLASS = circlePath({ cx: 50, cy: 40, r: 22 });
const CAP = rounded({ x: 41.5, y: 66, w: 17, h: 13, r: 3 });

function Cap({ ink, shine }: { readonly ink: VisualInk; readonly shine: ShineIds }): ReactNode {
  const base = useSvgId('cap');
  return (
    <>
      <BodyGradient id={base} ink={ink} />
      <Path d="M39 57 H61 L58 66 H42 Z" fill={ink.light} stroke={ink.edge} strokeWidth={0.5} />
      <Path d={CAP} fill={`url(#${base})`} stroke={ink.edge} strokeWidth={0.5} />
      <ShinePath d={CAP} ids={shine} />
      <Path
        d="M42 70.5 H58 M42 74.5 H58"
        stroke={ink.well}
        strokeOpacity={WELL}
        strokeWidth={1.1}
      />
      <Path d={rounded({ x: 46, y: 79, w: 8, h: 4, r: 2 })} fill={ink.ink} />
    </>
  );
}

export function LightVisual({ state, px, tone, reduced }: VisualProps): ReactNode {
  const ink = useInk();
  const warm = useColour('temp-warm');
  const lit = tone === 'active';
  const colour = state.colour ?? warm;
  const strength = lit ? 0.35 + 0.65 * state.level : 0;
  const shine = useShineIds();
  return (
    <>
      <Halo px={px} colour={colour} strength={strength} reduced={reduced} />
      <Canvas px={px} layer>
        <Circle
          cx={50}
          cy={40}
          r={22}
          fill={lit ? colour : ink.well}
          fillOpacity={lit ? 0.3 + 0.55 * state.level : WELL}
          stroke={ink.edge}
          strokeWidth={0.8}
        />
        <Path
          d="M43 44 Q46.5 34 50 44 Q53.5 34 57 44"
          stroke={lit ? colour : ink.faint}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        />
        <ShineGradients ids={shine} />
        <ShinePath d={GLASS} ids={shine} />
        <Cap ink={ink} shine={shine} />
      </Canvas>
    </>
  );
}
