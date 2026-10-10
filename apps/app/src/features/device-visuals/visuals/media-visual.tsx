import type { ReactNode } from 'react';
import { Circle, Defs, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { GLOW, loopStyle } from '../../../design/loops';
import { Canvas, Layer, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, useInk, WELL } from '../parts/ink';
import { rounded } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const WOOFER: Box = { x: 34, y: 44, w: 32, h: 32 };

function Woofer({
  px,
  colour,
  level,
  running,
}: {
  readonly px: number;
  readonly colour: string;
  readonly level: number;
  readonly running: boolean;
}): ReactNode {
  const pulse = loopStyle(
    { name: GLOW, ms: Math.round(900 - level * 400), easing: 'ease-in-out', alternate: true },
    running,
  );
  return (
    <Layer box={WOOFER} px={px} motion={pulse}>
      <Canvas px={(px * WOOFER.w) / 100}>
        <Circle
          cx={50}
          cy={50}
          r={36}
          fill="none"
          stroke={colour}
          strokeWidth={4}
          strokeOpacity={0.7}
        />
      </Canvas>
    </Layer>
  );
}

export function SpeakerVisual({ state, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('speaker');
  const tint = useColour(tone === 'active' ? 'viz-3' : 'on-surface-faint');
  return (
    <>
      <Canvas px={px}>
        <Defs>
          <BodyGradient id={body} ink={ink} />
        </Defs>
        <ContactShadow cx={50} cy={91} rx={24} ry={3.5} />
        <Path
          d={rounded({ x: 28, y: 10, w: 44, h: 80, r: 14 })}
          fill={`url(#${body})`}
          stroke={ink.edge}
          strokeWidth={0.6}
        />
        <Shine d={rounded({ x: 28, y: 10, w: 44, h: 80, r: 14 })} />
        <Circle
          cx={50}
          cy={28}
          r={7}
          fill={ink.well}
          fillOpacity={WELL}
          stroke={ink.edge}
          strokeWidth={0.5}
        />
        <Circle
          cx={50}
          cy={60}
          r={15}
          fill={ink.well}
          fillOpacity={WELL}
          stroke={ink.edge}
          strokeWidth={0.5}
        />
        <Circle cx={50} cy={60} r={5} fill={ink.dark} />
      </Canvas>
      {tone === 'active' ? (
        <Woofer px={px} colour={tint} level={state.level} running={moving} />
      ) : null}
    </>
  );
}
