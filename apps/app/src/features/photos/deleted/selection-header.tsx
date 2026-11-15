import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { pickedLine } from '../organise/selection-bar';
import type { DeletedTotals } from './model';
import {
  SelectionActions,
  SelectionGroup,
  SelectionSummary,
  SelectionSurface,
} from '../components/selection-surface';

export interface SelectionHeaderProps {
  readonly picked: DeletedTotals;
  readonly total: number;
  readonly disabled: boolean;
  readonly onClear: () => void;
  readonly onSelectAll: () => void;
  readonly onRestore: () => void;
  readonly onDeleteNow: (() => void) | null;
  readonly inline: boolean;
}

function Picked({ picked }: { readonly picked: DeletedTotals }): ReactNode {
  return (
    <View className="shrink-0 flex-row items-baseline gap-1.5">
      <Text variant="title-3" tone="onPrimaryContainer" className="tabular-nums" numberOfLines={1}>
        {pickedLine(picked.count)}
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
  total,
  disabled,
  onClear,
  onSelectAll,
  onRestore,
  onDeleteNow,
  inline,
}: SelectionHeaderProps): ReactNode {
  const off = !inline || disabled || picked.count === 0;
  return (
    <SelectionSurface>
      <SelectionSummary>
        <IconButton
          icon="close"
          label="Clear the selection"
          tone="onPrimaryContainer"
          onPress={onClear}
        />
        <Picked picked={picked} />
        {picked.count < total ? (
          <Button label="Select all" variant="text" onPress={onSelectAll} />
        ) : null}
      </SelectionSummary>
      {off ? null : (
        <SelectionActions>
          <SelectionGroup>
            <Button label="Restore" icon="archiveRestore" variant="tonal" onPress={onRestore} />
            {onDeleteNow === null ? null : (
              <Button label="Delete now" icon="trash" variant="destructive" onPress={onDeleteNow} />
            )}
          </SelectionGroup>
        </SelectionActions>
      )}
    </SelectionSurface>
  );
}
