import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '../../../../components/text';
import { STATES_COPY } from './states-copy';

export function CanvasReopening(): ReactNode {
  const copy = STATES_COPY.reopening;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center gap-3 px-6"
    >
      <ActivityIndicator size="small" colorClassName="accent-primary" />
      <Text variant="title-3" align="center">
        {copy.title}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {copy.body}
      </Text>
    </View>
  );
}
