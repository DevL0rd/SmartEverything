import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAnimationGate } from '../design/animation-gate';
import { useColour } from '../design/colour';
import { BREATHE, EASE_IN_OUT, loopStyle, type Loop } from '../design/loops';
import type { ColourRole } from '../design/tokens';
import { useOnScreen } from '../design/visibility';

export interface GlowProps {
  readonly colour: ColourRole;
  readonly x?: string;
  readonly y?: string;
  readonly radius?: string;
  readonly strength?: number;
  readonly breathing?: boolean;
}

const BREATH: Loop = { name: BREATHE, ms: 3200, easing: EASE_IN_OUT, alternate: true };

export function Glow({
  colour,
  x = '50%',
  y = '42%',
  radius = '62%',
  strength = 0.3,
  breathing = false,
}: GlowProps): ReactNode {
  const fill = useColour(colour);
  const id = `glow-${useId().replaceAll(':', '')}`;
  const ref = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(ref);
  const { moving } = useAnimationGate(breathing, visible);
  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="none" className="absolute inset-0">
      <Animated.View className="absolute inset-0" style={loopStyle(BREATH, moving)}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={id} cx={x} cy={y} r={radius}>
              <Stop offset="0" stopColor={fill} stopOpacity={strength} />
              <Stop offset="0.6" stopColor={fill} stopOpacity={strength / 3} />
              <Stop offset="1" stopColor={fill} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
