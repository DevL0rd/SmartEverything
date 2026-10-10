import type { ReactNode } from 'react';
import { View } from 'react-native';
import { modifierLabel } from '../../../design/platform';
import { Button } from '../../button';
import { Icon } from '../../icon';
import { IconButton } from '../../icon-button';
import { Interactive } from '../../interactive';
import { Text } from '../../text';

export interface EditToolbarProps {
  readonly touch: boolean;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly onReset: () => void;
  readonly onAdd: () => void;
}

export function EditToolbar(props: EditToolbarProps): ReactNode {
  const { touch, canUndo, onUndo, onReset, onAdd } = props;
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <Text variant="callout" tone="variant" className="min-w-48 flex-1">
        {touch
          ? 'Hold a widget and drag to move it. Drag the corner to resize.'
          : 'Drag to move. Drag the corner to resize. Space picks up a focused widget.'}
      </Text>
      <View className="flex-row items-center gap-1">
        <IconButton
          icon="undo"
          label="Undo"
          shortcut={`${modifierLabel()} Z`}
          disabled={!canUndo}
          onPress={onUndo}
        />
        <Button label="Reset layout" variant="text" onPress={onReset} />
        {touch ? null : <Button label="Add widget" icon="plus" variant="tonal" onPress={onAdd} />}
      </View>
    </View>
  );
}

export function AddTile({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      label="Add widget"
      onPress={onPress}
      className="h-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline"
      layerClassName="rounded-lg"
    >
      <View className="size-12 items-center justify-center rounded-full bg-primary-container">
        <Icon name="plus" size={24} tone="primary" />
      </View>
      <Text variant="label" tone="variant">
        Add widget
      </Text>
    </Interactive>
  );
}
