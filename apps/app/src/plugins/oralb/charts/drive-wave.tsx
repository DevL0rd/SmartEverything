import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { loopStyle, sway } from '../../../design/loops';
import { sizeStyle } from './style';
import {
  angleTag,
  angleText,
  drawnWidth,
  scrollPx,
  wavePath,
  type Angle,
} from '../model/wave-model';
import type { OralbMode } from '@smarteverything/domain';

export const WAVE_HEIGHT = 44;

const MS_PER_PX = 14;

const READOUT = 72;

export function Wave({
  width,
  mode,
  share,
  moving,
  tooHard,
}: {
  readonly width: number;
  readonly mode: OralbMode | null;
  readonly share: number;
  readonly moving: boolean;
  readonly tooHard: boolean;
}): ReactNode {
  const stroke = useColour(tooHard ? 'critical' : 'primary');
  const axis = useColour('outline-variant');
  const travel = scrollPx(mode);
  const motion = loopStyle({ name: sway(travel), ms: travel * MS_PER_PX }, moving);
  const total = drawnWidth(width, mode);
  return (
    <View aria-hidden className="overflow-hidden" style={sizeStyle(width, WAVE_HEIGHT)}>
      <Animated.View style={[sizeStyle(total, WAVE_HEIGHT), motion]}>
        <Svg width={total} height={WAVE_HEIGHT}>
          <Line
            x1={0}
            x2={total}
            y1={WAVE_HEIGHT / 2}
            y2={WAVE_HEIGHT / 2}
            stroke={axis}
            strokeWidth={1}
          />
          <Path
            d={wavePath(total, WAVE_HEIGHT, share, mode)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function DriveWave({
  width,
  mode,
  share,
  moving,
  tooHard,
  angle,
  label,
}: {
  readonly width: number;
  readonly mode: OralbMode | null;
  readonly share: number;
  readonly moving: boolean;
  readonly tooHard: boolean;
  readonly angle: Angle;
  readonly label: string;
}): ReactNode {
  const degrees = angleText(angle);
  const tag = angleTag(angle);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="flex-row items-center gap-3"
    >
      <Wave
        width={Math.max(0, width - READOUT - 12)}
        mode={mode}
        share={share}
        moving={moving}
        tooHard={tooHard}
      />
      <View style={sizeStyle(READOUT, WAVE_HEIGHT)} className="items-end justify-center">
        {degrees === null ? null : (
          <Text variant="title-3" className="tabular">
            {degrees}
          </Text>
        )}
        {tag === null ? null : (
          <Text variant="caption" tone="variant">
            {tag}
          </Text>
        )}
      </View>
    </View>
  );
}
