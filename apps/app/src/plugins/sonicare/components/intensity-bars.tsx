import type { BrushIntensity } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { INTENSITY_BARS, INTENSITY_LABEL } from '../../toothbrush/model/brush-model';

const HEIGHTS = ['h-2', 'h-3.5', 'h-5'] as const;

export function IntensityBars({
  intensity,
}: {
  readonly intensity: BrushIntensity | null;
}): ReactNode {
  const lit = intensity === null ? 0 : INTENSITY_BARS[intensity];
  const word =
    intensity === null ? 'Intensity not known' : `${INTENSITY_LABEL[intensity]} intensity`;
  return (
    <View accessible accessibilityLabel={word} className="flex-row items-end gap-2">
      <View aria-hidden className="h-5 flex-row items-end gap-1">
        {HEIGHTS.map((height, index) => (
          <View
            key={height}
            className={cn('w-1.5 rounded-full', height, index < lit ? 'bg-primary' : 'bg-outline')}
          />
        ))}
      </View>
      <Text variant="caption" tone="variant">
        {word}
      </Text>
    </View>
  );
}
