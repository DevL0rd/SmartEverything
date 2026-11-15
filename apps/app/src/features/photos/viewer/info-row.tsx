import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';

export function Row({
  icon,
  children,
}: {
  readonly icon: IconName;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row gap-3 py-2">
      <Icon name={icon} size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-0.5">{children}</View>
    </View>
  );
}

export function Lines({
  main,
  detail,
}: {
  readonly main: string;
  readonly detail: string | null;
}): ReactNode {
  return (
    <>
      <Text variant="callout" numberOfLines={2}>
        {main}
      </Text>
      {detail === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {detail}
        </Text>
      )}
    </>
  );
}
