import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';

export function AliasChips({
  aliases,
  onRemove,
}: {
  readonly aliases: readonly string[];
  readonly onRemove: (alias: string) => void;
}): ReactNode {
  if (aliases.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Also answers to
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {aliases.map((alias) => (
          <Interactive
            key={alias}
            label={`Remove ${alias}`}
            className="min-h-8 flex-row items-center gap-1.5 rounded-full border border-outline bg-surface-2 pl-3 pr-2"
            onPress={() => {
              onRemove(alias);
            }}
          >
            <Text variant="footnote">{alias}</Text>
            <Icon name="close" size={16} tone="variant" />
          </Interactive>
        ))}
      </View>
    </View>
  );
}
