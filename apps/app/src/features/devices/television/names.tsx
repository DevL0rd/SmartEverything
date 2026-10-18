import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { Television } from './use-television';

export function Names({ tv }: { readonly tv: Television }): ReactNode {
  const trouble = tv.view.mode === 'unreachable' || tv.view.mode === 'updating';
  return (
    <View className="min-w-0 flex-1 justify-center" pointerEvents="none">
      <Text variant="body-strong" numberOfLines={1}>
        {tv.name}
      </Text>
      <Text variant="footnote" tone={trouble ? 'warning' : 'variant'} numberOfLines={1}>
        {tv.line}
      </Text>
    </View>
  );
}
