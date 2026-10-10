import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function ModelsUnavailable({
  keeping,
  retry,
}: {
  readonly keeping: string;
  readonly retry: () => void;
}): ReactNode {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 self-center px-6 py-10">
      <Icon name="cloud" size={32} tone="variant" />
      <View className="items-center gap-1">
        <Text variant="body-strong" align="center">
          Models can’t load right now
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {`Your server can’t reach OpenRouter. The chat keeps using ${keeping}.`}
        </Text>
      </View>
      <Button label="Try again" variant="tonal" onPress={retry} />
    </View>
  );
}
