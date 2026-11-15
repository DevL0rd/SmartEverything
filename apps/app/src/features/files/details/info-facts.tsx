import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

export function InfoFact({
  label,
  first,
  children,
}: {
  readonly label: string;
  readonly first: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'min-h-row-h flex-row items-center gap-3 px-4 py-2',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <Text variant="footnote" tone="variant" className="w-24 shrink-0">
        {label}
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

export function InfoValue({
  text,
  tone,
}: {
  readonly text: string;
  readonly tone?: 'positive' | 'critical' | 'variant';
}): ReactNode {
  return (
    <Text
      variant="callout"
      selectable
      numberOfLines={2}
      {...(tone === undefined ? {} : { tone })}
      className="tabular min-w-0 flex-1"
    >
      {text}
    </Text>
  );
}

export function InfoCard({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
      {children}
    </View>
  );
}
