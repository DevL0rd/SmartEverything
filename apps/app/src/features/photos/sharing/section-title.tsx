import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function SectionTitle({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail?: string | null;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-11 flex-row items-center gap-2">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="shrink">
          {title}
        </Text>
        {detail === null || detail === undefined ? null : (
          <Text variant="footnote" tone="primary" className="tabular-nums">
            {detail}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}
