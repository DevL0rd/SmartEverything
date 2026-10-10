import type { ReactNode } from 'react';
import { Circle, Defs, Path } from 'react-native-svg';
import { Canvas, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, WELL } from '../parts/ink';
import { circlePath, rounded } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

export function CameraVisual({ px, tone }: VisualProps): ReactNode {
  const ink = useInk();
  const shell = useSvgId('camera');
  const live = useTint('positive', tone);
  return (
    <Canvas px={px}>
      <Defs>
        <BodyGradient id={shell} ink={ink} vertical />
      </Defs>
      <ContactShadow cx={50} cy={90} rx={26} ry={4} />
      <Path
        d="M28 86 Q28 74 50 74 Q72 74 72 86 Z"
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Path d={rounded({ x: 44, y: 64, w: 12, h: 12, r: 3 })} fill={ink.dark} />
      <Circle cx={50} cy={40} r={30} fill={`url(#${shell})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={circlePath({ cx: 50, cy: 40, r: 30 })} />
      <Path d={rounded({ x: 28, y: 30, w: 44, h: 26, r: 13 })} fill={ink.well} fillOpacity={WELL} />
      <Circle cx={50} cy={43} r={9} fill={ink.dark} stroke={ink.edge} strokeWidth={0.8} />
      <Circle cx={50} cy={43} r={4.5} fill={ink.well} fillOpacity={WELL} />
      <Circle cx={47.5} cy={40.5} r={1.6} fill={ink.sheen} fillOpacity={0.5} />
      <Circle cx={63} cy={43} r={1.6} fill={live} />
    </Canvas>
  );
}
