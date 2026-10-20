import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../../components/icon-button';
import { Text } from '../../../../../components/text';

export function newRowId(): string {
  return globalThis.crypto.randomUUID();
}

export interface RowActionsProps {
  readonly noun: string;
  readonly index: number;
  readonly count: number;
  readonly disabled: boolean;
  readonly onMove?: (to: number) => void;
  readonly onRemove: () => void;
  readonly canRemove?: boolean;
}

export function RowActions({
  noun,
  index,
  count,
  disabled,
  onMove,
  onRemove,
  canRemove = true,
}: RowActionsProps): ReactNode {
  return (
    <View className="flex-row items-center">
      {onMove === undefined ? null : (
        <>
          <IconButton
            icon="chevronUp"
            label={`Move ${noun} up`}
            disabled={disabled || index === 0}
            onPress={() => {
              onMove(index - 1);
            }}
          />
          <IconButton
            icon="chevronDown"
            label={`Move ${noun} down`}
            disabled={disabled || index === count - 1}
            onPress={() => {
              onMove(index + 1);
            }}
          />
        </>
      )}
      <IconButton
        icon="trash"
        label={`Remove ${noun}`}
        tone="critical"
        disabled={disabled || !canRemove}
        onPress={onRemove}
      />
    </View>
  );
}

export function RowTitle({ text }: { readonly text: string }): ReactNode {
  return <Text variant="body-strong">{text}</Text>;
}
