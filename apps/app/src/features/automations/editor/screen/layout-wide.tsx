import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

export interface LayoutWideProps {
  readonly top: ReactNode;
  readonly sentence: ReactNode;
  readonly banner: ReactNode;
  readonly left: ReactNode;
  readonly body: ReactNode;
  readonly float: ReactNode;
  readonly right: ReactNode;
  readonly onBodyLayout: (event: LayoutChangeEvent) => void;
}

export function LayoutWide({
  top,
  sentence,
  banner,
  left,
  body,
  float,
  right,
  onBodyLayout,
}: LayoutWideProps): ReactNode {
  return (
    <View className="min-h-0 flex-1 bg-surface-1 pt-safe">
      {top}
      {sentence}
      {banner}
      <View className="min-h-0 flex-1 flex-row">
        {left}
        <View className="relative min-h-0 min-w-0 flex-1" onLayout={onBodyLayout}>
          {body}
          {float}
        </View>
        {right}
      </View>
    </View>
  );
}
