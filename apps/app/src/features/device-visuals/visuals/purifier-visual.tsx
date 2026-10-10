import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, Path, Pattern } from 'react-native-svg';
import { BREATHE, SPIN, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, Squash, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, bandRole, useInk, useTint, type VisualInk, WELL } from '../parts/ink';
import { Dots } from '../parts/particles';
import { bladesPath, rounded, spinPeriod } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const SIDE = 'M26 24 V84 A24 7 0 0 0 74 84 V24 Z';
const GRILLE = 'M31 44 V78 A19 5.5 0 0 0 69 78 V44 A19 5.5 0 0 1 31 44 Z';
const OUTLET: Box = { x: 30, y: 4, w: 40, h: 40 };
const BLADES = bladesPath(7, 46, 12);
const SQUASH = 7 / 24;

function Body({
  ink,
  tint,
  detailed,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly detailed: boolean;
}): ReactNode {
  const body = useSvgId('purifier');
  const dots = useSvgId('grille');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
        <Pattern id={dots} width={3.4} height={3.4} patternUnits="userSpaceOnUse">
          <Circle cx={1.7} cy={2.05} r={0.8} fill={ink.light} />
          <Circle cx={1.7} cy={1.7} r={0.8} fill={ink.well} fillOpacity={0.85} />
        </Pattern>
      </Defs>
      <ContactShadow cx={50} cy={88} rx={34} ry={6} />
      <Path d={SIDE} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={SIDE} />
      {detailed ? <Path d={GRILLE} fill={`url(#${dots})`} /> : null}
      <Path d={rounded({ x: 44, y: 34, w: 12, h: 3, r: 1.5 })} fill={tint} />
      <Ellipse
        cx={50}
        cy={24}
        rx={24}
        ry={7}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Ellipse cx={50} cy={24} rx={20} ry={5.8} fill={ink.well} fillOpacity={WELL} />
    </>
  );
}

function Rotor({
  px,
  ink,
  period,
  running,
}: {
  readonly px: number;
  readonly ink: VisualInk;
  readonly period: number;
  readonly running: boolean;
}): ReactNode {
  return (
    <Squash box={OUTLET} px={px} ratio={SQUASH}>
      <Layer
        box={FULL}
        px={(px * OUTLET.w) / 100}
        motion={loopStyle({ name: SPIN, ms: period }, running)}
      >
        <Canvas px={(px * OUTLET.w) / 100}>
          <Path d={BLADES} fill={ink.ink} fillOpacity={0.85} />
          <Circle cx={50} cy={50} r={11} fill={ink.light} stroke={ink.edge} strokeWidth={1.5} />
        </Canvas>
      </Layer>
    </Squash>
  );
}

function Halo({
  px,
  tint,
  running,
  on,
}: {
  readonly px: number;
  readonly tint: string;
  readonly running: boolean;
  readonly on: boolean;
}): ReactNode {
  return (
    <Layer
      box={FULL}
      px={px}
      motion={loopStyle(
        { name: BREATHE, ms: 3000, easing: 'ease-in-out', alternate: true },
        running,
      )}
    >
      <Canvas px={px}>
        <Ellipse
          cx={50}
          cy={24}
          rx={28}
          ry={9.5}
          fill="none"
          stroke={tint}
          strokeWidth={1.4}
          strokeOpacity={on ? 0.85 : 0.35}
        />
      </Canvas>
    </Layer>
  );
}

export function PurifierVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint(bandRole(state.band), tone);
  const detailed = size !== 'tile';
  const breathing = moving && detailed;
  const period = spinPeriod(state.level, 2400, 500);
  const count = Math.max(2, Math.round(state.level * 6));
  return (
    <>
      <Canvas px={px}>
        <Body ink={ink} tint={tint} detailed={detailed} />
      </Canvas>
      <Halo px={px} tint={tint} running={breathing} on={tone === 'active'} />
      <Rotor px={px} ink={ink} period={period} running={moving} />
      {breathing ? (
        <Dots
          px={px}
          colour={tint}
          emitter={{
            x: 50,
            y: 17,
            spread: 13,
            travel: 16,
            size: 3.2,
            count,
            ms: 2800 - state.level * 1000,
          }}
        />
      ) : null}
    </>
  );
}
