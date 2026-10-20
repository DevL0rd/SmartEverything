import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { LoopStyle } from '../../../../design/loops';
import { BELT_Y, SEAM_PERIOD, TEXTURE_TRAVEL, VIEW } from './geometry';
import type { Silver } from './palette';

const BAND = { x: 46, y: BELT_Y - 3, w: 216, h: 8 } as const;
const STRIP_W = BAND.w + TEXTURE_TRAVEL + SEAM_PERIOD;
const GRAIN_PERIOD = SEAM_PERIOD / 2;

function seamPath(count: number, period: number, slant: number, offset: number): string {
  return Array.from({ length: count }, (_, index) => {
    const x = index * period + offset;
    return `M${String(x)} ${String(BAND.h)}l${String(slant)} ${String(-BAND.h)}`;
  }).join('');
}

function Texture({
  s,
  silver,
  motion,
}: {
  readonly s: number;
  readonly silver: Silver;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const seams = Math.ceil(STRIP_W / SEAM_PERIOD);
  const grains = Math.ceil(STRIP_W / GRAIN_PERIOD);
  const strip: ViewStyle = { width: STRIP_W * s, height: BAND.h * s };
  return (
    <Animated.View style={[strip, motion]}>
      <Svg
        width={STRIP_W * s}
        height={BAND.h * s}
        viewBox={`0 0 ${String(STRIP_W)} ${String(BAND.h)}`}
      >
        <Path
          d={seamPath(seams, SEAM_PERIOD, 7, 0)}
          stroke={silver.seam}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={seamPath(grains, GRAIN_PERIOD, 4, GRAIN_PERIOD / 2)}
          stroke={silver.grain}
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

export function Belt({
  px,
  silver,
  motion,
}: {
  readonly px: number;
  readonly silver: Silver;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const s = px / VIEW.w;
  const band: ViewStyle = {
    position: 'absolute',
    left: BAND.x * s,
    top: BAND.y * s,
    width: BAND.w * s,
    height: BAND.h * s,
    overflow: 'hidden',
    borderRadius: 1.5 * s,
    backgroundColor: silver.belt,
  };
  const edge: ViewStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BAND.w * s,
    height: 1.6 * s,
    backgroundColor: silver.edge,
  };
  return (
    <View pointerEvents="none" style={band}>
      <Texture s={s} silver={silver} motion={motion} />
      <View style={edge} />
    </View>
  );
}
