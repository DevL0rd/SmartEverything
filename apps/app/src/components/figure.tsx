import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useMotion } from '../design/motion';
import { Text } from './text';
import { TONE_TEXT, type Tone } from './tone';
import { useCountUp } from './use-count-up';

export type FigureSize = 's' | 'm' | 'l' | 'xl';

const SIZE: Readonly<Record<FigureSize, string>> = {
  s: 'text-figure-s',
  m: 'text-figure-m tracking-tight',
  l: 'text-figure-l tracking-tight',
  xl: 'text-figure-xl tracking-tighter',
};

const UNIT: Readonly<Record<FigureSize, 'footnote' | 'callout' | 'title-3' | 'title-2'>> = {
  s: 'footnote',
  m: 'callout',
  l: 'title-3',
  xl: 'title-2',
};

export interface FigureProps {
  readonly value: string;
  readonly unit?: string;
  readonly size?: FigureSize;
  readonly tone?: Tone;
  readonly stale?: boolean;
}

export function Figure({
  value,
  unit,
  size = 'm',
  tone = 'default',
  stale = false,
}: FigureProps): ReactNode {
  const shown: Tone = stale ? 'faint' : tone;
  const counted = useCountUp(value, !useMotion().reduced);
  return (
    <View className="flex-row items-baseline gap-1">
      <Text className={cn('font-sans-medium tabular', SIZE[size], TONE_TEXT[shown])}>
        {counted}
      </Text>
      {unit === undefined ? null : (
        <Text variant={UNIT[size]} tone={stale ? 'faint' : 'variant'}>
          {unit}
        </Text>
      )}
    </View>
  );
}
