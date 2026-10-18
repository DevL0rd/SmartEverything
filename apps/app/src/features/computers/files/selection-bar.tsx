import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { selectionLabel } from './selection-model';

export function SelectionBar({
  count,
  total,
  disabled,
  onDownload,
  onMove,
  onCopy,
  onTrash,
  onSelectAll,
  onClear,
}: {
  readonly count: number;
  readonly total: number;
  readonly disabled: boolean;
  readonly onDownload: () => void;
  readonly onMove: () => void;
  readonly onCopy: () => void;
  readonly onSelectAll: () => void;
  readonly onTrash: () => void;
  readonly onClear: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <IconButton icon="close" label="Clear the selection" onPress={onClear} />
      <Text variant="body-strong" className="min-w-0 flex-1">
        {selectionLabel(count)}
      </Text>
      {count < total ? <Button label="Select all" variant="text" onPress={onSelectAll} /> : null}
      <Button
        label="Download"
        icon="download"
        variant="tonal"
        disabled={disabled}
        onPress={onDownload}
      />
      <Button label="Move to…" icon="move" variant="tonal" disabled={disabled} onPress={onMove} />
      <Button label="Copy to…" icon="copy" variant="tonal" disabled={disabled} onPress={onCopy} />
      <Button
        label="Move to Trash"
        icon="trash"
        variant="destructive"
        disabled={disabled}
        onPress={onTrash}
      />
    </View>
  );
}
