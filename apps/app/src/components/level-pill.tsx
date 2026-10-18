import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { LEVEL_SEGMENTS, levelLook, type LevelTone } from './level-pill-model';
import { Text } from './text';
import { STATUS_FILL } from './tone';

export interface LevelPillProps {
  readonly percent: number;
  readonly label?: string;
  readonly tone?: LevelTone;
}

const SEGMENTS = Array.from({ length: LEVEL_SEGMENTS }, (_, index) => index);

const FILL: Readonly<Record<LevelTone, string>> = {
  ...STATUS_FILL,
  neutral: 'bg-on-surface-variant',
};

export function LevelPill({ percent, label, tone }: LevelPillProps): ReactNode {
  const look = levelLook(percent);
  const shown = tone ?? look.tone;
  const text = label ?? look.word;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={text}
      className="flex-row items-center gap-1.5"
    >
      <View className="flex-row gap-0.5" aria-hidden>
        {SEGMENTS.map((index) => (
          <View
            key={index}
            className={cn('h-2 w-2.5 rounded-xs', index < look.lit ? FILL[shown] : 'bg-outline')}
          />
        ))}
      </View>
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
