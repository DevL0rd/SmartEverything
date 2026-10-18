import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import type { QuickAskChoice } from './quick-ask-model';

export function TargetLine({
  value,
  continueLabel,
  onChange,
}: {
  readonly value: QuickAskChoice;
  readonly continueLabel: string | null;
  readonly onChange: (value: QuickAskChoice) => void;
}): ReactNode {
  return (
    <View className="px-3 pt-3">
      {continueLabel === null ? (
        <View className="min-h-8 flex-row items-center gap-1.5 px-1">
          <Icon name="plus" size={16} tone="variant" />
          <Text variant="label" tone="variant">
            New chat
          </Text>
        </View>
      ) : (
        <Segmented
          label="Target chat"
          value={value}
          onChange={onChange}
          options={[
            { value: 'new', label: 'New chat', icon: 'plus' },
            { value: 'continue', label: continueLabel },
          ]}
        />
      )}
    </View>
  );
}
