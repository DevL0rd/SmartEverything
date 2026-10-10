import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path } from 'react-native-svg';
import { EASE_IN_OUT, drift, loopStyle, sweep } from '../../../design/loops';
import { Canvas, FULL, Layer, Squash, boxStyle, scaled, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, useInk, useTint, type VisualInk, WELL } from '../parts/ink';
import { arcPath, rounded, type Ring } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const VENT: Box = { x: 43.5, y: 16, w: 13, h: 56 };
const FLOOR: Box = { x: 18, y: 54, w: 64, h: 64 };
const STREAKS = 'M3 6 V16 M6.5 24 V36 M10 12 V20 M3 34 V46 M10 42 V52';
const FRONT = 180;
const FLOOR_RING: Ring = { cx: 50, cy: 50, r: 44 };
const RESTING_ANGLE = 60;
const COLUMN = rounded({ x: 39, y: 6, w: 22, h: 80, r: 11 });

function Tower({ ink, tint }: { readonly ink: VisualInk; readonly tint: string }): ReactNode {
  const body = useSvgId('tower');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={90} rx={26} ry={5} />
      <Ellipse
        cx={50}
        cy={86}
        rx={17}
        ry={4.5}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Path d={COLUMN} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Path
        d={rounded({ x: VENT.x, y: VENT.y, w: VENT.w, h: VENT.h, r: 6.5 })}
        fill={ink.well}
        fillOpacity={WELL}
      />
      <Path
        d="M46.8 21 V67 M50 21 V67 M53.2 21 V67"
        stroke={ink.ink}
        strokeOpacity={0.3}
        strokeWidth={0.7}
      />
      <Shine d={COLUMN} gloss />
      <Circle cx={50} cy={11} r={1.4} fill={tint} />
    </>
  );
}

function Shimmer({
  px,
  colour,
  ms,
  running,
}: {
  readonly px: number;
  readonly colour: string;
  readonly ms: number;
  readonly running: boolean;
}): ReactNode {
  const clip: ViewStyle = {
    ...boxStyle(VENT, px),
    overflow: 'hidden',
    borderRadius: scaled(6.5, px),
  };
  const strip: ViewStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: scaled(VENT.w, px),
    height: scaled(VENT.h * 2, px),
  };
  return (
    <View pointerEvents="none" style={clip}>
      <Animated.View style={[strip, loopStyle({ name: drift(scaled(VENT.h, px)), ms }, running)]}>
        <Svg width="100%" height="100%" viewBox="0 0 13 112" preserveAspectRatio="none">
          <Path
            d={`${STREAKS} M3 62 V72 M6.5 80 V92 M10 68 V76 M3 90 V102 M10 98 V108`}
            stroke={colour}
            strokeOpacity={0.75}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Swing({
  px,
  colour,
  angle,
  running,
}: {
  readonly px: number;
  readonly colour: string;
  readonly angle: number;
  readonly running: boolean;
}): ReactNode {
  const inner = scaled(FLOOR.w, px);
  const half = angle / 2;
  return (
    <Squash box={FLOOR} px={px} ratio={0.22}>
      <Canvas px={inner}>
        <Path
          d={arcPath(FLOOR_RING, FRONT - half, FRONT + half)}
          stroke={colour}
          strokeOpacity={0.3}
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
        />
      </Canvas>
      <Layer
        box={FULL}
        px={inner}
        motion={loopStyle(
          { name: sweep(angle), ms: 3000, easing: EASE_IN_OUT, alternate: true },
          running,
        )}
      >
        <Canvas px={inner}>
          <Path
            d={arcPath(FLOOR_RING, FRONT - 7, FRONT + 7)}
            stroke={colour}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
          />
        </Canvas>
      </Layer>
    </Squash>
  );
}

export function TowerFanVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('temp-cool', tone);
  const angle = state.oscillating ? (state.angle ?? RESTING_ANGLE) : 0;
  const sweeping = moving && angle > 0;
  return (
    <>
      <Canvas px={px}>
        <Tower ink={ink} tint={tint} />
      </Canvas>
      {tone === 'active' && size !== 'tile' ? (
        <Swing px={px} colour={tint} angle={angle} running={sweeping} />
      ) : null}
      {tone === 'active' ? (
        <Shimmer
          px={px}
          colour={tint}
          ms={Math.round(2600 - state.level * 1800)}
          running={moving}
        />
      ) : null}
    </>
  );
}
