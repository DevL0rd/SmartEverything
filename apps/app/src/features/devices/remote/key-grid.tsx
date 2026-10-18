import type { ReactNode } from 'react';
import { View } from 'react-native';
import { buttonLabel } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';

export function KeyGrid({
  source,
  press,
}: {
  readonly source: { readonly keys: readonly string[]; readonly online: boolean };
  readonly press: (key: string) => void;
}): ReactNode {
  if (source.keys.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No buttons learned yet.
      </Text>
    );
  }
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="All buttons" className="gap-2">
      <Text variant="label" tone="variant">
        All buttons
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {source.keys.map((key) => (
          <Button
            key={key}
            label={buttonLabel(key)}
            variant="tonal"
            disabled={!source.online}
            onPress={() => {
              press(key);
            }}
          />
        ))}
      </View>
    </View>
  );
}
