import type { ReactNode } from 'react';
import { useState } from 'react';
import { Circle, Path } from 'react-native-svg';
import { RING, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, type VisualInk } from '../parts/ink';
import { ContactShadow, ShineGradients, ShinePath, useShineIds } from '../parts/material';
import { rounded } from '../parts/shapes';
import { ripplesFor } from '../model/button-ripple';
import type { ButtonGesture, VisualProps } from '../types';

const PLATE = rounded({ x: 18, y: 18, w: 64, h: 64, r: 18 });
const CAP = rounded({ x: 29, y: 29, w: 42, h: 42, r: 12 });
const RIPPLE_RADIUS = 36;
const STROKE = 2;
const LONG_STROKE = 3.2;
function Keycap({ ink, tint }: { readonly ink: VisualInk; readonly tint: string }): ReactNode {
  const plate = useSvgId('button-plate');
  const cap = useSvgId('button-cap');
  const shine = useShineIds();
  return (
    <>
      <BodyGradient id={plate} ink={ink} vertical />
      <BodyGradient id={cap} ink={ink} />
      <ContactShadow cx={50} cy={86} rx={30} ry={4.5} />
      <Path d={PLATE} fill={`url(#${plate})`} stroke={ink.edge} strokeWidth={0.6} />
      <Path d={CAP} fill={`url(#${cap})`} stroke={ink.edge} strokeWidth={0.5} />
      <ShineGradients ids={shine} />
      <ShinePath d={CAP} ids={shine} />
      <Circle cx={50} cy={50} r={3.2} fill={tint} />
    </>
  );
}

function Ripples({
  px,
  colour,
  gesture,
  at,
  playing,
}: {
  readonly px: number;
  readonly colour: string;
  readonly gesture: ButtonGesture | null;
  readonly at: string | null;
  readonly playing: boolean;
}): ReactNode {
  const [seen, setSeen] = useState(at);
  if (!playing && seen !== at) {
    setSeen(at);
  }
  const ripples = ripplesFor({ seen, at, gesture, playing });
  return ripples.map((ripple) => (
    <Layer
      key={ripple.key}
      box={FULL}
      px={px}
      motion={loopStyle(
        { name: RING, ms: ripple.ms, delay: ripple.delay, easing: 'ease-out', times: 1 },
        true,
      )}
    >
      <Canvas px={px}>
        <Circle
          cx={50}
          cy={50}
          r={RIPPLE_RADIUS}
          fill="none"
          stroke={colour}
          strokeWidth={gesture === 'long' ? LONG_STROKE : STROKE}
        />
      </Canvas>
    </Layer>
  ));
}

export function ButtonVisual({ state, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('primary', tone);
  const last = state.button?.lastPress ?? null;
  const playing = moving && state.online;
  return (
    <>
      <Canvas px={px} layer>
        <Keycap ink={ink} tint={tint} />
      </Canvas>
      <Ripples
        px={px}
        colour={tint}
        gesture={last?.gesture ?? null}
        at={last?.at ?? null}
        playing={playing}
      />
    </>
  );
}
