import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { AiMessageReference } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { referenceIcon, referenceKey, referenceLocation } from './presentation';
export function ReferenceChips({
  references,
  remove,
}: {
  readonly references: readonly AiMessageReference[];
  readonly remove: (item: AiMessageReference) => void;
}): ReactNode {
  if (references.length === 0) return null;
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerClassName="gap-2">
      {references.map((item) => (
        <View
          key={`${referenceKey(item.reference)}:${String(item.start)}`}
          className="max-w-56 flex-row items-center gap-1 rounded-lg border-hairline border-outline-variant bg-surface-2 pl-2"
        >
          <Icon name={referenceIcon(item.reference)} size={16} />
          <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
            {item.label}
          </Text>
          <IconButton
            icon="close"
            label={`Remove reference ${item.label}. ${referenceLocation(item.reference)}`}
            onPress={(): void => {
              remove(item);
            }}
          />
        </View>
      ))}
    </ScrollView>
  );
}
