import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function SheetLead({
  ring,
  subtitle,
}: {
  readonly ring: ReactNode;
  readonly subtitle: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      {ring}
      <Text variant="callout" tone="variant" className="min-w-0 flex-1">
        {subtitle}
      </Text>
    </View>
  );
}
