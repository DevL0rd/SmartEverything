import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

export function SectionStrip({
  count,
  current,
  caption,
}: {
  readonly count: number;
  readonly current: number;
  readonly caption: string;
}): ReactNode {
  return (
    <View accessible accessibilityLabel={caption} className="w-full gap-1.5">
      <View aria-hidden className="flex-row gap-1">
        {Array.from({ length: count }, (_, index) => (
          <View
            key={index}
            className={cn(
              'h-2 flex-1 rounded-full',
              index + 1 < current
                ? 'bg-positive'
                : index + 1 === current
                  ? 'bg-primary'
                  : 'bg-surface-3',
            )}
          />
        ))}
      </View>
      <Text variant="footnote" tone="variant" align="center">
        {caption}
      </Text>
    </View>
  );
}
