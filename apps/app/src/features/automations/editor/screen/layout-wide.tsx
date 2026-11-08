import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface LayoutWideProps {
  readonly top: ReactNode;
  readonly sentence: ReactNode;
  readonly banner: ReactNode;
  readonly left: ReactNode;
  readonly body: ReactNode;
  readonly float: ReactNode;
  readonly right: ReactNode;
}

export function LayoutWide({
  top,
  sentence,
  banner,
  left,
  body,
  float,
  right,
}: LayoutWideProps): ReactNode {
  return (
    <View className="min-h-0 flex-1 bg-surface-1 pt-safe">
      {top}
      {sentence}
      {banner}
      <View className="min-h-0 flex-1 flex-row">
        {left}
        <View className="relative min-h-0 min-w-0 flex-1">
          {body}
          <View pointerEvents="box-none" className="absolute inset-y-0 right-0 max-w-full">
            {float}
          </View>
        </View>
        {right}
      </View>
    </View>
  );
}
