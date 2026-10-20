import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../components/button';
import { Icon } from '../components/icon';
import { Text } from '../components/text';
import { useNavEdits } from './nav-edit-actions';
import type { NavSectionEntry } from './nav-model';

export function HiddenPages({
  hidden,
  title,
}: {
  readonly hidden: readonly NavSectionEntry[];
  readonly title: string | null;
}): ReactNode {
  const edits = useNavEdits();
  if (hidden.length === 0) return null;
  return (
    <View className="gap-0.5">
      {title === null ? null : (
        <Text variant="caption" tone="variant" className="px-4 pb-1">
          {title}
        </Text>
      )}
      {hidden.map((entry) => {
        const section = entry.node?.section;
        return (
          <View
            key={entry.key}
            className="h-12 flex-row items-center gap-3 rounded-full pl-4 pr-2 opacity-70"
          >
            <Icon name={entry.icon} size={24} tone="variant" />
            <Text variant="label" tone="variant" className="flex-1" numberOfLines={1}>
              {entry.title}
            </Text>
            {section === undefined ? null : (
              <Button
                label="Show"
                variant="text"
                onPress={() => {
                  edits.show(section);
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
