import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { type Box, Canvas, Squash, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, type VisualInk, WELL } from '../parts/ink';
import { Readout } from '../parts/readout';
import { rounded } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const EDGE: Box = { x: 10, y: 18, w: 80, h: 80 };
const TOP: Box = { x: 10, y: 12, w: 80, h: 80 };
const SQUASH = 0.5;

function Platform({ ink, px }: { readonly ink: VisualInk; readonly px: number }): ReactNode {
  const glass = useSvgId('glass');
  const inner = (px * TOP.w) / 100;
  return (
    <Squash box={TOP} px={px} ratio={SQUASH}>
      <Canvas px={inner}>
        <BodyGradient id={glass} ink={ink} vertical />
        <Path
          d={rounded({ x: 2, y: 2, w: 96, h: 96, r: 18 })}
          fill={`url(#${glass})`}
          stroke={ink.edge}
          strokeWidth={1}
        />
        <Shine d={rounded({ x: 2, y: 2, w: 96, h: 96, r: 18 })} />
        <Path
          d={rounded({ x: 22, y: 28, w: 56, h: 40, r: 10 })}
          fill={ink.well}
          fillOpacity={WELL}
        />
        <Circle cx={14} cy={14} r={3} fill={ink.edge} />
        <Circle cx={86} cy={14} r={3} fill={ink.edge} />
        <Circle cx={14} cy={86} r={3} fill={ink.edge} />
        <Circle cx={86} cy={86} r={3} fill={ink.edge} />
      </Canvas>
    </Squash>
  );
}

export function ScaleVisual({ state, size, px, tone }: VisualProps): ReactNode {
  const ink = useInk();
  const { reading } = state;
  return (
    <>
      <Canvas px={px}>
        <ContactShadow cx={50} cy={80} rx={44} ry={7} />
      </Canvas>
      <Squash box={EDGE} px={px} ratio={SQUASH}>
        <Canvas px={(px * EDGE.w) / 100}>
          <Path
            d={rounded({ x: 2, y: 2, w: 96, h: 96, r: 18 })}
            fill={ink.dark}
            stroke={ink.edge}
            strokeWidth={1}
          />
        </Canvas>
      </Squash>
      <Platform ink={ink} px={px} />
      {reading === null ? null : (
        <Readout
          box={{ x: 25, y: 41, w: 50, h: 20 }}
          px={px}
          size={size}
          tone={tone}
          figures={{ hero: 'm' }}
          value={reading.text}
          unit={reading.unit}
        />
      )}
    </>
  );
}
