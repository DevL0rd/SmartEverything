import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import type { DeletedTotals } from './model';

export interface SelectionHeaderProps {
  readonly picked: DeletedTotals;
  readonly disabled: boolean;
  readonly onClear: () => void;
  readonly onRestore: () => void;
  readonly onDeleteNow: (() => void) | null;
}

function Picked({ picked }: { readonly picked: DeletedTotals }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
      <Text variant="title-3" tone="onPrimaryContainer" className="tabular-nums" numberOfLines={1}>
        {`${count(picked.count)} selected`}
      </Text>
      {picked.count === 0 ? null : (
        <Text
          variant="footnote"
          tone="onPrimaryContainer"
          className="tabular-nums"
          numberOfLines={1}
        >
          {`· ${bytes(picked.bytes)}`}
        </Text>
      )}
    </View>
  );
}

export function SelectionHeader({
  picked,
  disabled,
  onClear,
  onRestore,
  onDeleteNow,
}: SelectionHeaderProps): ReactNode {
  const off = disabled || picked.count === 0;
  return (
    <View className="min-h-15 flex-row flex-wrap items-center gap-2 bg-primary-container px-gutter py-2">
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={onClear}
      />
      <Picked picked={picked} />
      <Button
        label="Restore"
        icon="archiveRestore"
        variant="tonal"
        disabled={off}
        onPress={onRestore}
      />
      {onDeleteNow === null ? null : (
        <>
          <View className="mx-1 h-5 w-px bg-on-primary-container/30" />
          <Button
            label="Delete now"
            icon="trash"
            variant="destructive"
            disabled={off}
            onPress={onDeleteNow}
          />
        </>
      )}
    </View>
  );
}
