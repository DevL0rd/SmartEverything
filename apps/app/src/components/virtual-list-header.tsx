import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Text } from './text';

function Header({
  title,
  widthClassName,
}: {
  readonly title: string;
  readonly widthClassName: string;
}): ReactNode {
  return (
    <View className="bg-bg px-gutter pb-1 pt-4">
      <Text
        variant="footnote"
        tone="variant"
        accessibilityRole="header"
        className={cn('w-full self-center', widthClassName)}
      >
        {title}
      </Text>
    </View>
  );
}

export const SectionHeader = memo(Header);
