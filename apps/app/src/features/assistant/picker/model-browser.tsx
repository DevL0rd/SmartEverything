import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ModelPicker } from './model-picker';

export function ModelBrowser(): ReactNode {
  return (
    <View className="min-h-0 flex-1 px-gutter">
      <ModelPicker engine="openrouter" picked={null} onPick={null} />
    </View>
  );
}
