import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { cn } from '../design/cn';
import { CopyButton } from './copy-button';
import { Text } from './text';

export interface CopyFieldProps {
  readonly label: string;
  readonly value: string;
  readonly wrapValue?: boolean;
}

export function CopyField({ label, value, wrapValue = false }: CopyFieldProps): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <View className="min-h-control-h flex-row items-center gap-1 rounded-md bg-surface-2 pl-3">
        <NativeText
          selectable
          {...(wrapValue ? {} : { numberOfLines: 1 })}
          className={cn(
            'flex-1 font-mono text-footnote text-on-surface',
            wrapValue && 'min-w-0 py-2',
          )}
        >
          {value}
        </NativeText>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} what={label} />
      </View>
    </View>
  );
}
