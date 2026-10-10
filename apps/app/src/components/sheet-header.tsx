import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from './icon-button';
import { Text } from './text';

export function SheetHeader({
  title,
  onClose,
  touch,
}: {
  readonly title: string | undefined;
  readonly onClose: () => void;
  readonly touch: boolean;
}): ReactNode {
  if (title === undefined) {
    return null;
  }
  return (
    <View className="min-h-touch-min flex-row items-center gap-2 pl-6 pr-2">
      <Text
        variant={touch ? 'title-2' : 'title-3'}
        accessibilityRole="header"
        className="flex-1"
        numberOfLines={2}
      >
        {title}
      </Text>
      {touch ? null : <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />}
    </View>
  );
}
