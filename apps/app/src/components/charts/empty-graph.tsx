import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../text';

export interface EmptyGraphProps {
  readonly text: string;
  readonly height?: number;
}

const DEFAULT_HEIGHT = 40;

export function EmptyGraph({ text, height = DEFAULT_HEIGHT }: EmptyGraphProps): ReactNode {
  const box = { height };
  return (
    <View style={box} className="w-full items-center justify-center" aria-hidden>
      <View className="absolute inset-x-0 bottom-3 border-t border-dashed border-outline" />
      <View className="rounded-xs bg-surface-1 px-2">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}
