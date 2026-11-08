import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function PrivateNote({ view }: { readonly view: BrushStateView }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Icon name="eyeOff" size={24} tone="faint" />
      <Text variant="callout" tone="variant" className="min-w-0 flex-1">
        {view.personName === null
          ? 'Sessions on this brush are private'
          : `Sessions on this brush belong to ${view.personName}`}
      </Text>
    </View>
  );
}
