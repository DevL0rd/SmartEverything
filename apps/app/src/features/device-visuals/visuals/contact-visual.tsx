import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { Canvas, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint } from '../parts/ink';
import { ContactShadow } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const FRAME = { x: 24, y: 10, w: 52, h: 80 } as const;
const CLOSED_DOOR = `M${String(FRAME.x)} ${String(FRAME.y)}H${String(FRAME.x + FRAME.w)}V${String(FRAME.y + FRAME.h)}H${String(FRAME.x)}Z`;
const OPEN_DOOR = 'M24 10L54 20V80L24 90Z';

export function ContactVisual({ state, px, tone }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('door');
  const open = state.open === true;
  const tint = useTint(open ? 'warning' : 'positive', tone);
  return (
    <Canvas px={px}>
      <BodyGradient id={body} ink={ink} vertical />
      <ContactShadow cx={50} cy={92} rx={34} ry={4} />
      <Path
        d={rounded({ x: FRAME.x - 4, y: FRAME.y - 4, w: FRAME.w + 8, h: FRAME.h + 8, r: 3 })}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      {open ? <Path d={CLOSED_DOOR} fill={ink.well} /> : null}
      <Path
        d={open ? OPEN_DOOR : CLOSED_DOOR}
        fill={`url(#${body})`}
        stroke={ink.edge}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <Circle cx={open ? 48 : 66} cy={52} r={2.2} fill={tint} />
    </Canvas>
  );
}
