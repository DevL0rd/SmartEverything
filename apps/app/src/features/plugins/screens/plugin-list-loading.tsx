import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';

export function PluginListLoading({ label }: { readonly label: string }): ReactNode {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} className="mx-gutter">
      <Skeleton shape="block" />
    </View>
  );
}
