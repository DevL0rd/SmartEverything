import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Circle, Defs, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { eased } from '../../../design/loops';
import { Canvas, FULL, Layer, boxStyle, useSvgId } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, WELL, type VisualInk } from '../parts/ink';
import { circlePath, rounded } from '../parts/shapes';
import { Shine } from '../parts/material';
import type { VisualProps } from '../types';

function Halo({
  px,
  colour,
  strength,
  reduced,
}: {
  readonly px: number;
  readonly colour: string;
  readonly strength: number;
  readonly reduced: boolean;
}): ReactNode {
  const id = useSvgId('light');
  const frame: ViewStyle = { ...boxStyle(FULL, px), opacity: strength };
  return (
    <Animated.View pointerEvents="none" style={[frame, eased('opacity', reduced)]}>
      <Canvas px={px}>
        <Defs>
          <GlowGradient id={id} colour={colour} strength={0.75} />
        </Defs>
        <Circle cx={50} cy={46} r={46} fill={`url(#${id})`} />
      </Canvas>
    </Animated.View>
  );
}

const GLASS = circlePath({ cx: 50, cy: 40, r: 22 });
const CAP = rounded({ x: 41.5, y: 66, w: 17, h: 13, r: 3 });

function Cap({ ink }: { readonly ink: VisualInk }): ReactNode {
  const base = useSvgId('cap');
  return (
    <>
      <Defs>
        <BodyGradient id={base} ink={ink} />
      </Defs>
      <Path d="M39 57 H61 L58 66 H42 Z" fill={ink.light} stroke={ink.edge} strokeWidth={0.5} />
      <Path d={CAP} fill={`url(#${base})`} stroke={ink.edge} strokeWidth={0.5} />
      <Shine d={CAP} />
      <Path
        d="M42 70.5 H58 M42 74.5 H58"
        stroke={ink.well}
        strokeOpacity={WELL}
        strokeWidth={1.1}
      />
      <Path d={rounded({ x: 46, y: 79, w: 8, h: 4, r: 2 })} fill={ink.ink} />
    </>
  );
}

export function LightVisual({ state, px, tone, reduced }: VisualProps): ReactNode {
  const ink = useInk();
  const warm = useColour('temp-warm');
  const lit = tone === 'active';
  const colour = state.colour ?? warm;
  const strength = lit ? 0.35 + 0.65 * state.level : 0;
  return (
    <>
      <Halo px={px} colour={colour} strength={strength} reduced={reduced} />
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <Circle
            cx={50}
            cy={40}
            r={22}
            fill={lit ? colour : ink.well}
            fillOpacity={lit ? 0.3 + 0.55 * state.level : WELL}
            stroke={ink.edge}
            strokeWidth={0.8}
          />
          <Path
            d="M43 44 Q46.5 34 50 44 Q53.5 34 57 44"
            stroke={lit ? colour : ink.faint}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
          <Shine d={GLASS} />
          <Cap ink={ink} />
        </Canvas>
      </Layer>
    </>
  );
}
