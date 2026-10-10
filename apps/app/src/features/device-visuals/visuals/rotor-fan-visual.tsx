import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, Path } from 'react-native-svg';
import { SPIN, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, useInk, useTint, type VisualInk, WELL } from '../parts/ink';
import { bladesPath, rounded, spinPeriod } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const HEAD: Box = { x: 20, y: 8, w: 60, h: 60 };
const BLADES = bladesPath(3, 44, 10, 40);

function Stand({ ink, tint }: { readonly ink: VisualInk; readonly tint: string }): ReactNode {
  const body = useSvgId('stand');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={91} rx={22} ry={3.5} />
      <Ellipse
        cx={50}
        cy={87}
        rx={16}
        ry={4.5}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Path
        d={rounded({ x: 47.5, y: 66, w: 5, h: 21, r: 2.5 })}
        fill={`url(#${body})`}
        stroke={ink.edge}
        strokeWidth={0.5}
      />
      <Shine d={rounded({ x: 47.5, y: 66, w: 5, h: 21, r: 2.5 })} />
      <Circle
        cx={50}
        cy={38}
        r={30}
        fill={ink.well}
        fillOpacity={WELL}
        stroke={ink.edge}
        strokeWidth={1.2}
      />
      <Circle cx={50} cy={38} r={24} fill="none" stroke={ink.edge} strokeWidth={0.5} />
      <Circle cx={50} cy={84} r={1.3} fill={tint} />
    </>
  );
}

export function RotorFanVisual({ state, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('temp-cool', tone);
  const headPx = (px * HEAD.w) / 100;
  return (
    <>
      <Canvas px={px}>
        <Stand ink={ink} tint={tint} />
      </Canvas>
      <Layer
        box={HEAD}
        px={px}
        motion={loopStyle({ name: SPIN, ms: spinPeriod(state.level, 1600, 320) }, moving)}
      >
        <Canvas px={headPx}>
          <Path d={BLADES} fill={tone === 'active' ? tint : ink.ink} fillOpacity={0.8} />
        </Canvas>
      </Layer>
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <Circle cx={50} cy={38} r={5} fill={ink.light} stroke={ink.edge} strokeWidth={0.6} />
        </Canvas>
      </Layer>
    </>
  );
}
