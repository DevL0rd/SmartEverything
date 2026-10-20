import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import {
  MakeReusableButton,
  MakeReusableNote,
  type MakeReusable,
} from '../../functions/make-reusable/selection-toolbar-action';
import { selectedText } from '../screen/screen-model';

export interface SelectionToolbarProps {
  readonly count: number;
  readonly reusable: MakeReusable;
  readonly onWrap?: () => void;
  readonly onDuplicate?: () => void;
  readonly onDelete?: () => void;
  readonly onClear: () => void;
}

export function SelectionToolbar({
  count,
  reusable,
  onWrap,
  onDuplicate,
  onDelete,
  onClear,
}: SelectionToolbarProps): ReactNode {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={`Selection, ${selectedText(count)}`}
      className="absolute inset-x-0 top-3 items-center gap-2 px-3"
      pointerEvents="box-none"
    >
      <View className="max-w-full flex-row flex-wrap items-center justify-center rounded-full border border-outline-variant bg-surface-raised px-1 elevation-2">
        <MakeReusableButton reusable={reusable} />
        {onWrap === undefined ? null : <Button label="Wrap in" variant="text" onPress={onWrap} />}
        {onDuplicate === undefined ? null : (
          <Button label="Duplicate" variant="text" icon="copy" onPress={onDuplicate} />
        )}
        {onDelete === undefined ? null : (
          <Button label="Delete" variant="destructive" icon="trash" onPress={onDelete} />
        )}
        <Button label="Clear" variant="text" onPress={onClear} />
      </View>
      <MakeReusableNote reusable={reusable} />
      {reusable.dialog}
    </View>
  );
}
