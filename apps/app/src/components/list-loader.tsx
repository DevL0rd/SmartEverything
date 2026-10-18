import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useColour } from '../design/colour';

export function ListLoader({ loading }: { readonly loading: boolean }): ReactNode {
  const tint = useColour('primary');
  return loading ? (
    <View className="items-center py-4">
      <ActivityIndicator color={tint} />
    </View>
  ) : null;
}
