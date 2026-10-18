import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CopyButton } from '../../../components/copy-button';
import { Text } from '../../../components/text';

export function InfoCard({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
      {children}
    </View>
  );
}

export function InfoRow({
  label,
  value,
  mono = false,
  copy = false,
  first = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly copy?: boolean;
  readonly first?: boolean;
}): ReactNode {
  return (
    <View
      className={
        first
          ? 'min-h-row-h flex-row items-center gap-3 px-4 py-2'
          : 'min-h-row-h flex-row items-center gap-3 border-t border-outline-variant px-4 py-2'
      }
    >
      <Text variant="footnote" tone="variant" className="w-24 shrink-0">
        {label}
      </Text>
      <Text
        variant="callout"
        selectable
        className={mono ? 'min-w-0 flex-1 font-mono' : 'min-w-0 flex-1'}
      >
        {value}
      </Text>
      {copy ? <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} /> : null}
    </View>
  );
}
