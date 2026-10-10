import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { loopStyle, sway } from '../../../design/loops';
import { boxStyle, scaled, useSvgId, type Box } from './frame';

const WAVE = 'M0 3 Q5 0 10 3 T20 3 T30 3 T40 3 T50 3 T60 3 T70 3 T80 3 V60 H0 Z';

function Wave({ height, colour }: { readonly height: number; readonly colour: string }): ReactNode {
  const depth = useSvgId('water');
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 80 ${String(height)}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={depth} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colour} stopOpacity={0.85} />
          <Stop offset="1" stopColor={colour} stopOpacity={0.45} />
        </LinearGradient>
      </Defs>
      <Path d={WAVE} fill={`url(#${depth})`} />
    </Svg>
  );
}

export function Water({
  box,
  px,
  level,
  colour,
  radius,
  running,
}: {
  readonly box: Box;
  readonly px: number;
  readonly level: number;
  readonly colour: string;
  readonly radius: number;
  readonly running: boolean;
}): ReactNode {
  const window: ViewStyle = {
    ...boxStyle(box, px),
    overflow: 'hidden',
    borderRadius: scaled(radius, px),
  };
  const height = box.h * level + 3;
  const surface: ViewStyle = {
    position: 'absolute',
    left: 0,
    top: scaled(box.h - height, px),
    width: scaled(box.w * 2, px),
    height: scaled(height, px),
  };
  const motion = loopStyle({ name: sway(scaled(box.w, px)), ms: 4200 }, running);
  return (
    <View pointerEvents="none" style={window}>
      <Animated.View style={[surface, motion]}>
        <Wave height={height} colour={colour} />
      </Animated.View>
    </View>
  );
}
