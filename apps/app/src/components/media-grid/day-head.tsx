import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { Icon } from '../icon';
import { Text } from '../text';

export interface DayHeadProps {
  readonly title: string;
  readonly detail: string;
  readonly place: string | null;
  readonly action: ReactNode;
}

function Head({ title, detail, place, action }: DayHeadProps): ReactNode {
  return (
    <View className="flex-row items-center gap-2 bg-bg px-gutter pb-2 pt-4">
      <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
        <Text variant="title-3" accessibilityRole="header" numberOfLines={1} className="shrink-0">
          {title}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1} className="shrink-0 tabular-nums">
          {detail}
        </Text>
        {place === null ? null : (
          <View className="min-w-0 shrink flex-row items-center gap-1 self-center">
            <Icon name="mapPin" size={16} tone="variant" />
            <Text variant="callout" tone="variant" numberOfLines={1} className="shrink">
              {place}
            </Text>
          </View>
        )}
      </View>
      {action}
    </View>
  );
}

export const DayHead = memo(Head);
