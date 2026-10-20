import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../text';

export function AxisLabel({
  left,
  top,
  text,
}: {
  readonly left: number;
  readonly top: number;
  readonly text: string;
}): ReactNode {
  const place = { left, top };
  return (
    <View pointerEvents="none" className="absolute" style={place}>
      <Text variant="caption" tone="faint" className="tabular">
        {text}
      </Text>
    </View>
  );
}
