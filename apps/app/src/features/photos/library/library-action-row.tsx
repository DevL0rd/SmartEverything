import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { organiseMenuItems, useOrganiseActions } from '../organise/actions';
import type { LibrarySelectionProps, SelectionExtra } from './library-selection';
import {
  keepActions,
  LocalSelection,
  NO_EXTRAS,
  pickedOf,
  sendActions,
  shown,
  type PickedProps,
  type SelectionAction,
} from './selection-model';

interface BarProps {
  readonly icon: IconName;
  readonly label: string;
  readonly disabled: boolean;
  readonly tone?: Tone;
  readonly onPress: () => void;
}

export function BarAction({
  icon,
  label,
  disabled,
  tone = 'default',
  onPress,
}: BarProps): ReactNode {
  return (
    <Interactive
      label={label}
      disabled={disabled}
      onPress={onPress}
      className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
      layerClassName="rounded-md"
    >
      <Icon name={icon} size={24} tone={tone} />
      <Text variant="caption" tone={tone}>
        {label}
      </Text>
    </Interactive>
  );
}

function BarAlbum({ media, picked }: PickedProps): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(media.albums(picked.ids), 'Add to album');
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="layers" label="Album" disabled={false} onPress={open} />
      {menu}
    </View>
  );
}

function menuItemOf(action: SelectionAction): MenuItem {
  return { id: action.id, label: action.label, icon: action.icon, onPress: action.onPress };
}

function BarOrganise(input: PickedProps): ReactNode {
  const { picked, onTrashed } = input;
  const actions = useOrganiseActions();
  const { ref, open, menu } = useAnchoredMenu(
    [
      ...shown(keepActions(input)).map(menuItemOf),
      ...organiseMenuItems({
        actions,
        itemIds: picked.ids,
        current: null,
        archived: false,
        onGone: onTrashed,
        onSaved: onTrashed,
      }),
    ],
    'More actions',
  );
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="more" label="More" disabled={false} onPress={open} />
      {menu}
    </View>
  );
}

function BarSend(input: PickedProps): ReactNode {
  return shown(sendActions(input)).map((action) => (
    <BarAction
      key={action.id}
      icon={action.icon}
      label={action.label}
      disabled={false}
      onPress={action.onPress}
    />
  ));
}

function BarActions({
  input,
  extras,
}: {
  readonly input: PickedProps;
  readonly extras: readonly SelectionExtra[];
}): ReactNode {
  const { media, picked, onTrashed } = input;
  if (picked.none) return null;
  return (
    <View className="flex-row">
      <BarSend {...input} />
      <BarAlbum {...input} />
      <BarOrganise {...input} />
      {extras
        .filter((extra) => !extra.disabled)
        .map((extra) => (
          <BarAction
            key={extra.id}
            icon={extra.icon}
            label={extra.short}
            disabled={false}
            onPress={() => {
              extra.onPress(picked.ids);
            }}
          />
        ))}
      <BarAction
        icon="trash"
        label="Trash"
        tone="critical"
        disabled={false}
        onPress={() => {
          media.trash(picked.ids, onTrashed);
        }}
      />
    </View>
  );
}

export function LibraryActionRow(props: LibrarySelectionProps): ReactNode {
  const { controls, media, extras = NO_EXTRAS } = props;
  const picked = pickedOf(props);
  const input: PickedProps = { media, picked, onTrashed: controls.clear };
  return (
    <View className="gap-2">
      <LocalSelection picked={picked} />
      <BarActions input={input} extras={extras} />
    </View>
  );
}

