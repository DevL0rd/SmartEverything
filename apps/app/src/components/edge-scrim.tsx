import type { ReactNode } from 'react';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useColour } from '../design/colour';

export type ScrimEdge = 'top' | 'bottom';

export function EdgeScrim({ edge }: { readonly edge: ScrimEdge }): ReactNode {
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const shade = useColour('scrim');
  const top = edge === 'top';
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
            <Stop offset="0" stopColor={shade} stopOpacity={1} />
            <Stop offset="0.6" stopColor={shade} stopOpacity={0.7} />
            <Stop offset="1" stopColor={shade} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
