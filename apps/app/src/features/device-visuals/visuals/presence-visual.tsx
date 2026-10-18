import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { RING, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, tintRole, useInk, WELL } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const PHONE = rounded({ x: 33, y: 10, w: 34, h: 70, r: 8 });
const SCREEN = rounded({ x: 36, y: 15, w: 28, h: 60, r: 5 });
const PIN =
  'M50 30 C44.5 30 41 34 41 38.5 C41 45 50 53 50 53 C50 53 59 45 59 38.5 C59 34 55.5 30 50 30 Z';

function Ripple({ px, colour }: { readonly px: number; readonly colour: string }): ReactNode {
  return (
    <Layer
      box={FULL}
      px={px}
      motion={loopStyle({ name: RING, ms: 2400, easing: 'ease-out' }, true)}
    >
      <Canvas px={px}>
        <Ellipse cx={50} cy={86} rx={30} ry={7} fill="none" stroke={colour} strokeWidth={1.4} />
      </Canvas>
    </Layer>
  );
}

export function PresenceVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('phone');
  const home = state.presence === true;
  const colour = useColour(tintRole(home ? 'positive' : 'on-surface-faint', tone));
  return (
    <>
      {home && moving && size !== 'tile' ? <Ripple px={px} colour={colour} /> : null}
      <Canvas px={px} layer>
        <BodyGradient id={body} ink={ink} />
        <ContactShadow cx={50} cy={86} rx={28} ry={5} />
        <Ellipse cx={50} cy={86} rx={22} ry={4.5} fill={colour} fillOpacity={home ? 0.22 : 0.08} />
        <Path d={PHONE} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
        <Shine d={PHONE} gloss />
        <Path d={SCREEN} fill={ink.well} fillOpacity={WELL} />
        <Path d={PIN} fill={colour} fillOpacity={home ? 0.95 : 0.5} />
        <Circle cx={50} cy={38.5} r={3.4} fill={ink.well} fillOpacity={WELL} />
      </Canvas>
    </>
  );
}
