import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { eased } from '../../../design/loops';
import { type Box, Canvas, boxStyle, scaled, useSvgId } from '../parts/frame';
import { useInk } from '../parts/ink';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';

const PANE: Box = { x: 18, y: 14, w: 64, h: 70 };
const SLATS = Array.from({ length: 18 }, (_, index) => `M0 ${String(index * 4 + 3.5)} H64`).join(
  ' ',
);

function Sky({ id }: { readonly id: string }): ReactNode {
  const top = useColour('info');
  const bottom = useColour('temp-cool');
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={top} stopOpacity={0.35} />
      <Stop offset="1" stopColor={bottom} stopOpacity={0.15} />
    </LinearGradient>
  );
}

function Blind({
  px,
  closed,
  reduced,
}: {
  readonly px: number;
  readonly closed: number;
  readonly reduced: boolean;
}): ReactNode {
  const ink = useInk();
  const frame: ViewStyle = { ...boxStyle(PANE, px), overflow: 'hidden' };
  const fabric: ViewStyle = {
    width: '100%',
    height: scaled(PANE.h * closed, px),
    overflow: 'hidden',
    backgroundColor: ink.light,
  };
  return (
    <View pointerEvents="none" style={frame}>
      <Animated.View style={[fabric, eased('height', reduced)]}>
        <Svg width={scaled(PANE.w, px)} height={scaled(PANE.h, px)} viewBox="0 0 64 70">
          <Path d={SLATS} stroke={ink.edge} strokeWidth={0.6} />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function CoverVisual({ state, px, reduced }: VisualProps): ReactNode {
  const ink = useInk();
  const sky = useSvgId('sky');
  const closed = state.position === null ? 0 : 1 - state.position;
  return (
    <>
      <Canvas px={px}>
        <Sky id={sky} />
        <Path
          d={rounded({ x: 14, y: 10, w: 72, h: 78, r: 5 })}
          fill={ink.dark}
          stroke={ink.edge}
          strokeWidth={0.6}
        />
        <Path
          d={rounded({ x: PANE.x, y: PANE.y, w: PANE.w, h: PANE.h, r: 2 })}
          fill={`url(#${sky})`}
        />
        <Path d="M50 14 V84 M18 49 H82" stroke={ink.dark} strokeWidth={1.5} />
        <Path
          d={rounded({ x: 10, y: 86, w: 80, h: 4, r: 2 })}
          fill={ink.light}
          stroke={ink.edge}
          strokeWidth={0.5}
        />
      </Canvas>
      <Blind px={px} closed={closed} reduced={reduced} />
      <Canvas px={px} layer>
        <Path
          d={rounded({ x: 16, y: 11, w: 68, h: 4, r: 2 })}
          fill={ink.light}
          stroke={ink.edge}
          strokeWidth={0.5}
        />
      </Canvas>
    </>
  );
}
