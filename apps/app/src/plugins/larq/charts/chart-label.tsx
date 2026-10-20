import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function ChartLabel({
  left,
  top,
  text,
  align = 'start',
  width = 48,
  tone = 'faint',
}: {
  readonly left: number;
  readonly top: number;
  readonly text: string;
  readonly align?: 'start' | 'center' | 'end';
  readonly width?: number;
  readonly tone?: 'faint' | 'variant';
}): ReactNode {
  const place = { left, top, width };
  return (
    <View pointerEvents="none" style={place} className="absolute">
      <Text variant="caption" tone={tone} align={align} numberOfLines={1} className="tabular">
        {text}
      </Text>
    </View>
  );
}
