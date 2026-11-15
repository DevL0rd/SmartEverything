import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useIsPhone } from '../../../design/size-class';

export interface TopBarProps {
  readonly title: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly busy: boolean;
  readonly canSaveVersion: boolean;
  readonly compare: boolean;
  readonly onCancel: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCompare: (on: boolean) => void;
  readonly onSave: (mode: 'version' | 'copy') => void;
}

function SaveMenu({
  items,
  disabled,
}: {
  readonly items: readonly MenuItem[];
  readonly disabled: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'More ways to save');
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="chevronDown" label="More ways to save" disabled={disabled} onPress={open} />
      {menu}
    </View>
  );
}

function Compare({
  on,
  disabled,
  onChange,
}: {
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onChange: (on: boolean) => void;
}): ReactNode {
  return (
    <Interactive
      label="Hold to compare with the original"
      selected={on}
      disabled={disabled}
      onPressIn={() => {
        onChange(true);
      }}
      onPressOut={() => {
        onChange(false);
      }}
      className="size-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <Icon name="eye" size={24} tone={on ? 'primary' : 'default'} />
    </Interactive>
  );
}

function SaveActions(props: TopBarProps): ReactNode {
  const off = !props.dirty || props.busy;
  if (!props.canSaveVersion) {
    return (
      <Button
        label="Save as copy"
        variant="filled"
        loading={props.saving}
        disabled={off}
        onPress={() => {
          props.onSave('copy');
        }}
      />
    );
  }
  const items: readonly MenuItem[] = [
    {
      label: 'Save as copy',
      description: 'Keeps this photo as it is',
      icon: 'copy',
      onPress: (): void => {
        props.onSave('copy');
      },
    },
  ];
  return (
    <View className="flex-row items-center gap-1">
      <Button
        label="Save"
        variant="filled"
        loading={props.saving}
        disabled={off}
        onPress={() => {
          props.onSave('version');
        }}
      />
      <SaveMenu items={items} disabled={off} />
    </View>
  );
}

export function TopBar(props: TopBarProps): ReactNode {
  const phone = useIsPhone();
  const title = (
    <Text
      variant="label"
      numberOfLines={1}
      className={phone ? 'px-4 pb-1 text-center' : 'min-w-0 flex-1'}
    >
      {props.title}
    </Text>
  );
  return (
    <View className="pt-safe">
      <View className="min-h-16 flex-row items-center gap-1 px-2">
        <IconButton icon="close" label="Cancel" onPress={props.onCancel} shortcut="Esc" />
        {phone ? <View className="flex-1" /> : title}
        <IconButton
          icon="undo"
          label="Undo"
          disabled={!props.canUndo || props.busy}
          onPress={props.onUndo}
        />
        <IconButton
          icon="redo"
          label="Redo"
          disabled={!props.canRedo || props.busy}
          onPress={props.onRedo}
        />
        <Compare on={props.compare} disabled={props.busy} onChange={props.onCompare} />
        <SaveActions {...props} />
      </View>
      {phone ? title : null}
    </View>
  );
}
