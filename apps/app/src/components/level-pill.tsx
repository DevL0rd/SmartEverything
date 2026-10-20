import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../design/colour';
import type { ColourRole } from '../design/tokens';
import {
  LEVEL_SEGMENTS,
  SEGMENT_HEIGHT,
  SEGMENTS_WIDTH,
  levelLook,
  segmentsPath,
  type LevelTone,
} from './level-pill-model';
import { Text } from './text';

export interface LevelPillProps {
  readonly percent: number;
  readonly label?: string;
  readonly tone?: LevelTone;
}

const FILL: Readonly<Record<LevelTone, ColourRole>> = {
  info: 'info',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  neutral: 'on-surface-variant',
};

export function LevelPill({ percent, label, tone }: LevelPillProps): ReactNode {
  const look = levelLook(percent);
  const shown = tone ?? look.tone;
  const text = label ?? look.word;
  const lit = useColour(FILL[shown]);
  const unlit = useColour('outline');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={text}
      className="flex-row items-center gap-1.5"
    >
      <Svg width={SEGMENTS_WIDTH} height={SEGMENT_HEIGHT} aria-hidden>
        {look.lit < LEVEL_SEGMENTS ? (
          <Path d={segmentsPath(look.lit, LEVEL_SEGMENTS)} fill={unlit} />
        ) : null}
        {look.lit > 0 ? <Path d={segmentsPath(0, look.lit)} fill={lit} /> : null}
      </Svg>
      <Text
        variant="caption"
        tone={shown === 'warning' ? 'warning' : 'variant'}
        className="tabular"
      >
        {text}
      </Text>
    </View>
  );
}
