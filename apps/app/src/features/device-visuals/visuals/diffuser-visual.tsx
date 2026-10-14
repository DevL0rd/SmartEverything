import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, Path } from 'react-native-svg';
import { BREATHE, EASE_IN_OUT, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, useTint, WELL, type VisualInk } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const BODY = rounded({ x: 27, y: 28, w: 46, h: 59, r: 17 });
const LID = rounded({ x: 30, y: 25, w: 40, h: 12, r: 6 });
const BAND = rounded({ x: 29, y: 72, w: 42, h: 5, r: 2.5 });
const BREATH = { name: BREATHE, ms: 3200, easing: EASE_IN_OUT, alternate: true } as const;

function AmbientGlow({
  px,
  colour,
  moving,
}: {
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const glow = useSvgId('diffuser-glow');
  return (
    <Layer box={FULL} px={px} motion={loopStyle(BREATH, moving)}>
      <Canvas px={px}>
        <Defs>
          <GlowGradient id={glow} colour={colour} strength={0.4} />
        </Defs>
        <Ellipse cx={50} cy={74} rx={41} ry={23} fill={`url(#${glow})`} />
      </Canvas>
    </Layer>
  );
}

function Dispenser({
  ink,
  tint,
  colour,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly colour: string | null;
}): ReactNode {
  const body = useSvgId('diffuser-body');
  const lid = useSvgId('diffuser-lid');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
        <BodyGradient id={lid} ink={ink} vertical />
      </Defs>
      <ContactShadow cx={50} cy={89} rx={32} ry={5} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={BODY} />
      <Path d={LID} fill={`url(#${lid})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={LID} vertical />
      <Ellipse cx={50} cy={28} rx={6} ry={1.8} fill={ink.well} fillOpacity={WELL} />
      <Path d="M47 28 H53" stroke={ink.faint} strokeWidth={0.8} strokeLinecap="round" />
      <Path
        d={BAND}
        fill={colour ?? ink.well}
        fillOpacity={colour === null ? 0.12 : 0.8}
        stroke={ink.edge}
        strokeWidth={0.3}
      />
      <Circle cx={50} cy={57} r={2} fill={ink.well} fillOpacity={0.25} />
      <Circle cx={50} cy={57} r={0.8} fill={tint} />
    </>
  );
}

export function DiffuserVisual({ state, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('primary', tone);
  const colour = state.online && state.ambientLight === true ? state.colour : null;
  return (
    <>
      {colour === null ? null : <AmbientGlow px={px} colour={colour} moving={moving} />}
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <Dispenser ink={ink} tint={tint} colour={colour} />
        </Canvas>
      </Layer>
    </>
  );
}
