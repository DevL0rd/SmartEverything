import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { CopyButton } from './copy-button';
import { Text } from './text';

export interface CopyFieldProps {
  readonly label: string;
  readonly value: string;
}

export function CopyField({ label, value }: CopyFieldProps): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <View className="min-h-control-h flex-row items-center gap-1 rounded-md bg-surface-2 pl-3">
        <NativeText
          selectable
          numberOfLines={1}
          className="flex-1 font-mono text-footnote text-on-surface"
        >
          {value}
        </NativeText>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </View>
    </View>
  );
}
