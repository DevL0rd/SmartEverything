import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, Path } from 'react-native-svg';
import { Canvas, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, WELL } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { arcPath, rounded, type Ring } from '../parts/shapes';
import type { VisualProps } from '../types';

const PUCK = 'M22 60 V70 A28 8.5 0 0 0 78 70 V60 Z';
const WAVES: Ring = { cx: 50, cy: 54, r: 0 };
const HANDSET = rounded({ x: 35, y: 8, w: 30, h: 84, r: 13 });
const BUTTONS: readonly (readonly [number, number])[] = [
  [44, 62],
  [56, 62],
  [44, 72],
  [56, 72],
];

function Waves({ colour }: { readonly colour: string }): ReactNode {
  return [18, 27, 36].map((radius, index) => (
    <Path
      key={radius}
      d={arcPath({ ...WAVES, r: radius }, -42, 42)}
      stroke={colour}
      strokeOpacity={0.75 - index * 0.22}
      strokeWidth={2.2}
      strokeLinecap="round"
      fill="none"
    />
  ));
}

export function IrBlasterVisual({ tone, px }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('blaster');
  const tint = useTint('info', tone);
  return (
    <Canvas px={px}>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={78} rx={36} ry={6} />
      <Path d={PUCK} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={PUCK} />
      <Path
        d="M22 65 A28 8.5 0 0 0 78 65"
        stroke={ink.well}
        strokeOpacity={WELL}
        strokeWidth={3}
        fill="none"
      />
      <Ellipse
        cx={50}
        cy={60}
        rx={28}
        ry={8.5}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Ellipse cx={50} cy={60} rx={9} ry={2.8} fill={ink.well} fillOpacity={WELL} />
      <Circle cx={50} cy={60} r={1.3} fill={tint} />
      <Waves colour={tint} />
    </Canvas>
  );
}

export function IrRemoteVisual({ tone, px }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('remote');
  const tint = useTint('info', tone);
  return (
    <Canvas px={px}>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={93} rx={20} ry={3.5} />
      <Path d={HANDSET} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={HANDSET} gloss />
      <Path d={rounded({ x: 45, y: 10, w: 10, h: 3, r: 1.5 })} fill={ink.well} fillOpacity={WELL} />
      <Circle cx={50} cy={20} r={2} fill={tint} />
      <Circle
        cx={50}
        cy={40}
        r={10}
        fill={ink.well}
        fillOpacity={WELL * 0.6}
        stroke={ink.edge}
        strokeWidth={0.5}
      />
      <Circle cx={50} cy={40} r={4} fill={ink.light} stroke={ink.edge} strokeWidth={0.5} />
      {BUTTONS.map(([cx, cy]) => (
        <Circle
          key={`${String(cx)}-${String(cy)}`}
          cx={cx}
          cy={cy}
          r={3}
          fill={ink.light}
          stroke={ink.edge}
          strokeWidth={0.5}
        />
      ))}
    </Canvas>
  );
}
