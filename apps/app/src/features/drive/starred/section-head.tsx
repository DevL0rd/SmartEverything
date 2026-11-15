import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export interface SectionHeadProps {
  readonly title: string;
  readonly note?: string;
  readonly action?: ReactNode;
}

export function SectionHead({ title, note, action }: SectionHeadProps): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center gap-2 px-1">
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" role="heading" numberOfLines={1}>
          {title}
        </Text>
        {note === undefined ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {note}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}
