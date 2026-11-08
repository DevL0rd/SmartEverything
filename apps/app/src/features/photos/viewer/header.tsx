import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';

export interface HeaderText {
  readonly title: string;
  readonly detail: string | null;
}

export interface HeaderControls {
  readonly starred: boolean;
  readonly infoOpen: boolean;
  readonly busy: boolean;
  readonly albums: readonly MenuItem[];
  readonly more: readonly MenuItem[];
  readonly onClose: () => void;
  readonly onFavourite: () => void;
  readonly onShare: () => void;
  readonly onInfo: () => void;
  readonly onTrash: () => void;
}

function MenuIconButton({
  icon,
  label,
  items,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly items: readonly MenuItem[];
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={icon} label={label} onPress={open} />
      {menu}
    </View>
  );
}

function Titles({ text }: { readonly text: HeaderText }): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <Text variant="label" numberOfLines={1}>
        {text.title}
      </Text>
      {text.detail === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {text.detail}
        </Text>
      )}
    </View>
  );
}

export function DesktopHeader({
  text,
  controls,
}: {
  readonly text: HeaderText;
  readonly controls: HeaderControls;
}): ReactNode {
  return (
    <View className="h-16 flex-row items-center gap-2 px-4">
      <IconButton icon="arrowLeft" label="Close viewer" onPress={controls.onClose} shortcut="Esc" />
      <Titles text={text} />
      <IconButton
        icon="star"
        label={controls.starred ? 'Remove from favourites' : 'Favourite'}
        selected={controls.starred}
        disabled={controls.busy}
        onPress={controls.onFavourite}
        shortcut="F"
      />
      <MenuIconButton icon="layers" label="Add to album" items={controls.albums} />
      <IconButton
        icon="share"
        label="Share link"
        disabled={controls.busy}
        onPress={controls.onShare}
      />
      <IconButton
        icon="info"
        label={controls.infoOpen ? 'Info, open' : 'Info'}
        selected={controls.infoOpen}
        onPress={controls.onInfo}
        shortcut="I"
      />
      <MenuIconButton icon="ellipsis" label="More" items={controls.more} />
    </View>
  );
}

export function PhoneHeader({
  text,
  controls,
}: {
  readonly text: HeaderText;
  readonly controls: HeaderControls;
}): ReactNode {
  return (
    <View className="h-14 flex-row items-center gap-1 px-1 pt-safe">
      <IconButton icon="arrowLeft" label="Back" onPress={controls.onClose} />
      <Titles text={text} />
      <MenuIconButton icon="ellipsisVertical" label="More" items={controls.more} />
    </View>
  );
}

function BarAction({
  icon,
  label,
  tone = 'default',
  selected = false,
  disabled = false,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly tone?: Tone;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
      layerClassName="rounded-md"
    >
      <Icon name={icon} size={24} tone={selected ? 'primary' : tone} />
      <Text variant="caption" tone={selected ? 'primary' : tone}>
        {label}
      </Text>
    </Interactive>
  );
}

function AlbumAction({ items }: { readonly items: readonly MenuItem[] }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'Add to album');
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="layers" label="Album" onPress={open} />
      {menu}
    </View>
  );
}

export function PhoneActions({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <View className="flex-row px-2 pb-safe-offset-3 pt-2">
      <BarAction
        icon="star"
        label="Favourite"
        selected={controls.starred}
        disabled={controls.busy}
        onPress={controls.onFavourite}
      />
      <BarAction icon="share" label="Share" disabled={controls.busy} onPress={controls.onShare} />
      <AlbumAction items={controls.albums} />
      <BarAction icon="info" label="Info" onPress={controls.onInfo} />
      <BarAction
        icon="trash"
        label="Trash"
        tone="critical"
        disabled={controls.busy}
        onPress={controls.onTrash}
      />
    </View>
  );
}
