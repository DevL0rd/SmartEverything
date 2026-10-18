import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { Canvas, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, type VisualInk } from '../parts/ink';
import { ContactShadow, ShineGradients, ShinePath, useShineIds } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const BODY = rounded({ x: 16, y: 34, w: 68, h: 40, r: 20 });
const SIGNAL_ARCS = ['M38 28 A16 16 0 0 1 62 28', 'M31 21 A26 26 0 0 1 69 21'] as const;

function Puck({
  ink,
  status,
  online,
}: {
  readonly ink: VisualInk;
  readonly status: string;
  readonly online: boolean;
}): ReactNode {
  const body = useSvgId('hub-body');
  const shine = useShineIds();
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <ContactShadow cx={50} cy={80} rx={34} ry={5} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <ShineGradients ids={shine} />
      <ShinePath d={BODY} ids={shine} />
      <Ellipse
        cx={50}
        cy={54}
        rx={22}
        ry={9}
        fill="none"
        stroke={status}
        strokeWidth={2.4}
        strokeOpacity={online ? 0.95 : 0.5}
      />
      <Circle cx={50} cy={54} r={2.6} fill={status} />
      {SIGNAL_ARCS.map((arc) => (
        <Path
          key={arc}
          d={arc}
          fill="none"
          stroke={status}
          strokeWidth={2}
          strokeLinecap="round"
          strokeOpacity={online ? 0.8 : 0.25}
        />
      ))}
    </>
  );
}

export function HubVisual({ state, px }: VisualProps): ReactNode {
  const ink = useInk();
  const status = useColour(state.online ? 'positive' : 'on-surface-faint');
  return (
    <Canvas px={px} layer>
      <Puck ink={ink} status={status} online={state.online} />
    </Canvas>
  );
}
