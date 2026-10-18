import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text, type TextVariant } from '../../../components/text';
import { nameParts } from '../model/name-parts';

export function LightName({
  name,
  variant,
}: {
  readonly name: string;
  readonly variant: TextVariant;
}): ReactNode {
  const { head, tail } = nameParts(name);
  if (tail === '') {
    return (
      <Text variant={variant} numberOfLines={1} className="shrink">
        {name}
      </Text>
    );
  }
  return (
    <View accessible accessibilityLabel={name} className="min-w-0 shrink flex-row">
      <Text variant={variant} aria-hidden numberOfLines={1} className="shrink">
        {head}
      </Text>
      <Text variant={variant} aria-hidden className="shrink-0">
        {tail}
      </Text>
    </View>
  );
}
