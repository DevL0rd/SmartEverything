import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export interface SummaryWellProps {
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}

export function SummaryWell({ title, trailing, children }: SummaryWellProps): ReactNode {
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <View className="min-h-6 flex-row items-center gap-2">
        <Text variant="footnote" className="min-w-0 flex-1 font-sans-medium" numberOfLines={1}>
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}
