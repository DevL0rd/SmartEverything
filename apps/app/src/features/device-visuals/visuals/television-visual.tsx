import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { BREATHE, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, boxStyle, useSvgId, type Box } from '../parts/frame';
import { GlowGradient, useInk, WELL, type VisualInk } from '../parts/ink';
import { ContactShadow, LIGHT, Shine } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const BEZEL = rounded({ x: 6, y: 16, w: 88, h: 56, r: 5 });
const SCREEN = rounded({ x: 9, y: 19, w: 82, h: 50, r: 3 });
const HILLS = 'M9 58 Q26 46 42 54 T74 50 T91 54 V66 Q91 69 88 69 H12 Q9 69 9 66 Z';
const LABEL: Box = { x: 9, y: 56, w: 82, h: 12 };

function Picture({ id }: { readonly id: string }): ReactNode {
  const top = useColour('viz-3');
  const bottom = useColour('viz-1');
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={top} stopOpacity={0.9} />
      <Stop offset="1" stopColor={bottom} stopOpacity={0.8} />
    </LinearGradient>
  );
}

function Ambient({ px, running }: { readonly px: number; readonly running: boolean }): ReactNode {
  const id = useSvgId('ambient');
  const colour = useColour('viz-3');
  const motion = loopStyle(
    { name: BREATHE, ms: 4200, easing: 'ease-in-out', alternate: true },
    running,
  );
  return (
    <Layer box={FULL} px={px} motion={motion}>
      <Canvas px={px}>
        <Defs>
          <GlowGradient id={id} colour={colour} strength={0.45} />
        </Defs>
        <Ellipse cx={50} cy={44} rx={50} ry={42} fill={`url(#${id})`} />
      </Canvas>
    </Layer>
  );
}

function Set({ ink, lit }: { readonly ink: VisualInk; readonly lit: boolean }): ReactNode {
  const picture = useSvgId('screen');
  return (
    <>
      <Defs>
        <Picture id={picture} />
      </Defs>
      <ContactShadow cx={50} cy={86} rx={30} ry={4.5} />
      <Path d="M44 72 H56 L57 82 H43 Z" fill={ink.dark} />
      <Ellipse
        cx={50}
        cy={83}
        rx={16}
        ry={2.6}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.5}
      />
      <Path d={BEZEL} fill={ink.dark} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={BEZEL} vertical />
      <Path d={SCREEN} fill={lit ? `url(#${picture})` : ink.well} fillOpacity={lit ? 1 : WELL} />
      {lit ? <Path d={HILLS} fill={LIGHT} fillOpacity={0.14} /> : null}
      <Path
        d="M16 62 L38 24"
        stroke={LIGHT}
        strokeOpacity={lit ? 0.14 : 0.07}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </>
  );
}

function Source({ px, label }: { readonly px: number; readonly label: string }): ReactNode {
  return (
    <View pointerEvents="none" style={boxStyle(LABEL, px)} className="items-center justify-center">
      <View className="elevation-1 rounded-full bg-surface-raised px-2">
        <Text variant="caption" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export function TelevisionVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const lit = tone === 'active';
  return (
    <>
      {lit ? <Ambient px={px} running={moving} /> : null}
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <Set ink={ink} lit={lit} />
        </Canvas>
      </Layer>
      {lit && size !== 'tile' && state.source !== null ? (
        <Source px={px} label={state.source} />
      ) : null}
    </>
  );
}
