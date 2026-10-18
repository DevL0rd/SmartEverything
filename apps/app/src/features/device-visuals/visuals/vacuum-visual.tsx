import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { SPIN, loopStyle } from '../../../design/loops';
import { type Box, Canvas, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, WELL } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { circlePath } from '../parts/shapes';
import type { VisualProps } from '../types';

const TURRET: Box = { x: 38, y: 22, w: 24, h: 24 };

export function VacuumVisual({ px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('robot');
  const tint = useTint('primary', tone);
  return (
    <>
      <Canvas px={px}>
        <BodyGradient id={body} ink={ink} vertical />
        <ContactShadow cx={51} cy={55} rx={40} ry={40} />
        <Circle cx={50} cy={52} r={40} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
        <Shine d={circlePath({ cx: 50, cy: 52, r: 40 })} />
        <Path
          d="M18 34 A40 40 0 0 1 82 34"
          stroke={ink.well}
          strokeOpacity={WELL}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx={50} cy={34} r={10} fill={ink.light} stroke={ink.edge} strokeWidth={0.5} />
        <Circle
          cx={50}
          cy={66}
          r={4}
          fill={ink.well}
          fillOpacity={WELL}
          stroke={tint}
          strokeWidth={1.2}
        />
      </Canvas>
      <Layer box={TURRET} px={px} motion={loopStyle({ name: SPIN, ms: 1800 }, moving)}>
        <Canvas px={(px * TURRET.w) / 100}>
          <Path d="M50 18 V34" stroke={tint} strokeWidth={6} strokeLinecap="round" />
        </Canvas>
      </Layer>
    </>
  );
}
