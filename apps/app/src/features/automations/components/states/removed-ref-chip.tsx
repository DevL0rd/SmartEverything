import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { STATES_COPY } from './states-copy';

export function RemovedRefChip({ name }: { readonly name: string }): ReactNode {
  const copy = STATES_COPY.removedRef;
  return (
    <View
      accessible
      accessibilityLabel={copy.label(name)}
      accessibilityHint={copy.hint}
      className="min-h-8 flex-row items-center gap-1 self-start rounded-full border border-critical bg-critical/10 px-3 py-1"
    >
      <Icon name="alert" size={16} tone="critical" />
      <Text variant="caption" tone="critical" numberOfLines={1}>
        {copy.label(name)}
      </Text>
    </View>
  );
}
