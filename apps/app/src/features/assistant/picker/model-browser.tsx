import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ModelPicker } from './model-picker';

export function ModelBrowser(): ReactNode {
  return (
    <View className="min-h-0 w-full max-w-reading flex-1 self-center px-gutter">
      <ModelPicker picked={null} onPick={null} />
    </View>
  );
}
